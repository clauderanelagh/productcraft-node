import type { TokenManager } from "./tokens.js";

/** Where the real-time connection is: `polling` means the stream failed 3 times in a row and counts are polled. */
export type RealtimeStatus = "idle" | "connecting" | "open" | "polling" | "paused";

/** The part of `document` the stream needs (absent in React Native and workers). */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", cb: () => void): void;
  removeEventListener(type: "visibilitychange", cb: () => void): void;
}

export interface RealtimeHandlers {
  /** A stream event (`item.created`, `item.updated`, `counts`, …) with its parsed `data`. */
  event(name: string, data: unknown): void;
  /** Counts from the polling fallback, when they changed. */
  polled(counts: { unseen: number; unread: number }): void;
  status(s: RealtimeStatus): void;
}

export interface RealtimeConfig {
  baseUrl: string;
  fetch: typeof fetch;
  tokens: TokenManager;
  handlers: RealtimeHandlers;
  document?: VisibilitySource | undefined;
  random?: () => number;
}

const MIN = 1_000;
const MAX = 30_000;
/** The polling fallback's interval: never more often than every 30 s (design 8). */
export const POLL_MS = 30_000;
const STREAM = "/v1/client/inbox/stream";

/** Reconnect delay after `n` consecutive failures: 1 s doubling to 30 s, plus up to 1 s of jitter. */
export const backoff = (n: number, random: () => number = Math.random): number =>
  Math.min(MAX, MIN * 2 ** Math.max(0, n - 1)) + Math.floor(random() * 1_000);

const retryAfterMs = (res: Response): number => {
  const v = Number(res.headers.get("retry-after"));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 3_600) * 1_000 : 0;
};

/**
 * The fetch-stream SSE reader (design 8): `Authorization: Bearer` (EventSource cannot send headers, and a
 * token never goes in a URL), `Last-Event-ID` catch-up, the server's `retry`, backoff with jitter, a new
 * token on `401`/`auth_expired`, counts polling with ETag after 3 failures, and a pause while the page is hidden.
 */
export class Realtime {
  status: RealtimeStatus = "idle";
  #c: RealtimeConfig;
  #running = false;
  #ac: AbortController | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #failures = 0;
  #authRetries = 0;
  #retry: number | undefined;
  #lastId: string | undefined;
  #etag: string | undefined;
  #manualPause = false;

  constructor(c: RealtimeConfig) {
    this.#c = c;
  }

  get lastEventId(): string | undefined {
    return this.#lastId;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#c.document?.addEventListener("visibilitychange", this.#onVisibility);
    this.#connect();
  }

  stop(): void {
    this.#running = false;
    this.#c.document?.removeEventListener("visibilitychange", this.#onVisibility);
    this.#halt();
    this.#set("idle");
  }

  /** Close the connection until `resume()` (React Native: call from an AppState listener). */
  pause(): void {
    this.#manualPause = true;
    if (this.#running) this.#pauseNow();
  }

  resume(): void {
    this.#manualPause = false;
    if (this.#running && !this.#hidden()) this.#connect();
  }

  #hidden = (): boolean => this.#manualPause || this.#c.document?.visibilityState === "hidden";

  #onVisibility = (): void => {
    if (!this.#running) return;
    if (this.#hidden()) this.#pauseNow();
    else this.#connect();
  };

  #pauseNow(): void {
    this.#halt();
    this.#set("paused");
  }

  #halt(): void {
    this.#ac?.abort();
    this.#ac = undefined;
    clearTimeout(this.#timer);
    this.#stopPolling();
  }

  #set(s: RealtimeStatus): void {
    if (this.status !== s) this.#c.handlers.status((this.status = s));
  }

  #schedule(ms: number): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#connect(), ms);
  }

  async #connect(): Promise<void> {
    clearTimeout(this.#timer);
    this.#ac?.abort();
    if (!this.#running) return;
    if (this.#hidden()) return this.#set("paused");
    const ac = (this.#ac = new AbortController());
    if (!this.#pollTimer) this.#set("connecting");
    let wait = 0;
    let token: string | undefined;
    try {
      token = await this.#c.tokens.get();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "text/event-stream" };
      if (this.#lastId) headers["Last-Event-ID"] = this.#lastId;
      const res = await this.#c.fetch(this.#c.baseUrl + STREAM, { headers, signal: ac.signal, cache: "no-store" });
      if (res.status === 401 && this.#authRetries++ < 1) {
        await res.body?.cancel().catch(() => undefined);
        await this.#c.tokens.refresh(token);
        return void this.#connect();
      }
      if (!res.ok || !res.body) {
        wait = retryAfterMs(res);
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`stream ${res.status}`);
      }
      this.#failures = 0;
      this.#stopPolling();
      this.#set("open");
      if (await this.#read(res.body)) {
        // auth_expired: a fresh token, then reconnect at once.
        await this.#c.tokens.refresh(token);
        this.#authRetries = 0;
        return void this.#connect();
      }
      this.#authRetries = 0;
      if (ac.signal.aborted) return;
      this.#schedule(Math.max(this.#retry ?? 0, backoff(1, this.#c.random)));
    } catch {
      if (ac.signal.aborted || !this.#running) return;
      this.#authRetries = 0;
      if (++this.#failures >= 3) this.#startPolling();
      this.#schedule(Math.max(wait, this.#retry ?? 0, backoff(this.#failures, this.#c.random)));
    }
  }

  /** Reads one stream to its end. Resolves `true` on `auth_expired`. */
  async #read(body: ReadableStream<Uint8Array>): Promise<boolean> {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let name = "";
    let data: string[] = [];
    let id: string | undefined;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return false;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line === "") {
            if (id !== undefined) this.#lastId = id;
            if (data.length) {
              let parsed: unknown;
              try {
                parsed = JSON.parse(data.join("\n"));
              } catch {
                parsed = data.join("\n");
              }
              if (name === "auth_expired") return true;
              this.#c.handlers.event(name || "message", parsed);
            }
            name = "";
            data = [];
            id = undefined;
            continue;
          }
          if (line[0] === ":") continue;
          const c = line.indexOf(":");
          const field = c < 0 ? line : line.slice(0, c);
          const v = c < 0 ? "" : line.slice(c + 1).replace(/^ /, "");
          if (field === "event") name = v;
          else if (field === "data") data.push(v);
          else if (field === "id" && !v.includes("\0")) id = v;
          else if (field === "retry" && /^\d+$/.test(v)) this.#retry = Number(v);
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  }

  #startPolling(): void {
    if (this.#pollTimer) return;
    this.#set("polling");
    const tick = async (): Promise<void> => {
      let next = POLL_MS;
      try {
        const token = await this.#c.tokens.get();
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (this.#etag) headers["If-None-Match"] = this.#etag;
        const res = await this.#c.fetch(this.#c.baseUrl + "/v1/client/inbox/counts", { headers, cache: "no-store" });
        next = Math.max(next, retryAfterMs(res));
        if (res.status === 401) await this.#c.tokens.refresh(token);
        else if (res.status === 200) {
          this.#etag = res.headers.get("etag") ?? undefined;
          const counts = (await res.json()) as { unseen: number; unread: number };
          if (this.#pollTimer) this.#c.handlers.polled(counts);
        }
      } catch {
        // Offline: try again next interval.
      }
      if (this.#pollTimer) this.#pollTimer = setTimeout(tick, next);
    };
    this.#pollTimer = setTimeout(tick, 0);
  }

  #stopPolling(): void {
    clearTimeout(this.#pollTimer);
    this.#pollTimer = undefined;
  }
}

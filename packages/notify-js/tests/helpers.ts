// A fake Notify client API behind an injected `fetch`: JSON routes plus a controllable SSE stream.
import type { Notify } from "@productcraft/notify";

export interface Call {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Sse {
  send(event: string, data: unknown, id?: string): void;
  raw(text: string): void;
  end(): void;
  readonly closed: boolean;
}

type Route = (call: Call) => Response | Promise<Response>;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 || status === 304 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const apiError = (status: number, code: string): Response =>
  json({ code, message: code, status }, status);

let seq = 0;
/** A time-ordered uuid-ish id (later calls sort higher, like uuidv7). */
export const nextId = (): string => `0190a000-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

export const item = (over: Partial<Notify.InboxItem> = {}): Notify.InboxItem =>
  ({
    id: nextId(),
    notification_id: "0190a000-0000-7000-8000-ffffffffffff",
    type: "comment_created",
    category: "comments",
    tenant: null,
    title: "New comment",
    body: "Ada commented",
    action_url: null,
    avatar_url: null,
    actions: [],
    actor: null,
    data: {},
    created_at: new Date().toISOString(),
    seen_at: null,
    read_at: null,
    archived_at: null,
    interacted_at: null,
    interaction_key: null,
    retracted_at: null,
    ...over,
  }) as Notify.InboxItem;

export function fakeApi() {
  const calls: Call[] = [];
  const routes = new Map<string, Route>();
  const streams: Sse[] = [];
  let streamReply: ((call: Call) => Response | null) | undefined;

  const openStream = (signal?: AbortSignal | null): Response => {
    const enc = new TextEncoder();
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => void (ctrl = c),
      cancel: () => void (closed = true),
    });
    const sse: Sse = {
      send: (event, data, id) => sse.raw(`event: ${event}\n${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(data)}\n\n`),
      raw: (text) => {
        if (!closed) ctrl.enqueue(enc.encode(text));
      },
      end: () => {
        if (!closed) (closed = true), ctrl.close();
      },
      get closed() {
        return closed;
      },
    };
    signal?.addEventListener("abort", () => {
      if (!closed) (closed = true), ctrl.error(new DOMException("aborted", "AbortError"));
    });
    streams.push(sse);
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    // Never build a Request: jsdom's AbortSignal is not the one Node's Request accepts.
    const isReq = typeof Request !== "undefined" && input instanceof Request;
    const href = isReq ? (input as Request).url : String(input);
    const method = (isReq ? (input as Request).method : init.method) ?? "GET";
    const url = new URL(href);
    const headers: Record<string, string> = {};
    new Headers(isReq ? (input as Request).headers : init.headers).forEach((v, k) => (headers[k] = v));
    const text = isReq ? await (input as Request).text() : typeof init.body === "string" ? init.body : "";
    const req = { method, url: href, signal: init.signal };
    const call: Call = { method, url: href, path: url.pathname, headers, body: text ? JSON.parse(text) : undefined };
    calls.push(call);
    if (url.pathname === "/v1/client/inbox/stream") {
      const r = streamReply?.(call);
      return r ?? openStream(req.signal);
    }
    const route = routes.get(`${req.method} ${url.pathname}`);
    if (!route) return apiError(404, "NOT_FOUND");
    return route(call);
  };

  return {
    fetch: fetch as typeof globalThis.fetch,
    calls,
    streams,
    on(key: string, route: Route) {
      routes.set(key, route);
    },
    /** Override the stream response (return null to open a normal stream). */
    stream(reply: (call: Call) => Response | null) {
      streamReply = reply;
    },
    get lastStream(): Sse {
      const s = streams[streams.length - 1];
      if (!s) throw new Error("no stream opened");
      return s;
    },
  };
}

export const inboxPage = (data: Notify.InboxItem[], counts = { unseen: data.length, unread: data.length }, next: string | null = null) =>
  json({ data, counts, pagination: { next_cursor: next, has_more: next !== null } });

/** Let pending promises and stream reads settle. */
export const flush = async (n = 10): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

export const until = async (cond: () => boolean, ms = 2_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
};

/**
 * `APIPromise`: what every SDK method returns. Await it for the parsed
 * body, or call `.withResponse()` / `.asResponse()` for the HTTP layer.
 */

/** Metadata attached (non-enumerable) to every object an SDK method returns. */
export interface LastResponse {
  requestId: string | undefined;
  status: number;
  headers: Headers;
}

/** One rate-limit window: `X-RateLimit-{Limit,Remaining,Reset}` with the same suffix. */
export interface RateLimitWindow {
  limit: number | undefined;
  remaining: number | undefined;
  /** As sent by the server (seconds until reset, or a unix timestamp, per API). */
  reset: number | undefined;
}

/**
 * Parsed `X-RateLimit-*` headers. Fields are `undefined` when the header is absent.
 *
 * ProductCraft APIs limit per window and name each one in the header
 * (`X-RateLimit-Remaining-short` for the one-second window, `-long` for the
 * one-minute window). The top-level fields are the binding window: the one
 * with the fewest requests left (on a tie, the one that resets last).
 * `windows` has every window by name; an unsuffixed header is window `""`.
 */
export interface RateLimitInfo extends RateLimitWindow {
  /** The binding window's name (`"short"`, `"long"`), `""` for unsuffixed headers. */
  window: string;
  windows: Record<string, RateLimitWindow>;
}

export interface WithResponse<T> {
  data: T;
  response: Response;
  requestId: string | undefined;
  rateLimit: RateLimitInfo | undefined;
}

/** What the transport hands to an `APIPromise`: a successful response plus how to parse it. */
export interface RawResult {
  response: Response;
  requestId: string | undefined;
}

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const RATE_LIMIT_HEADER = /^x-ratelimit-(limit|remaining|reset)(?:-(.+))?$/;

export function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const windows: Record<string, RateLimitWindow> = {};
  headers.forEach((value, key) => {
    const m = RATE_LIMIT_HEADER.exec(key.toLowerCase());
    if (!m) return;
    const v = num(value);
    if (v === undefined) return;
    const name = m[2] ?? "";
    const w = (windows[name] ??= { limit: undefined, remaining: undefined, reset: undefined });
    w[m[1] as keyof RateLimitWindow] = v;
  });
  // The binding window: fewest remaining, then the later reset (it holds the caller back longer).
  let best: [string, RateLimitWindow] | undefined;
  for (const entry of Object.entries(windows).sort(([a], [b]) => a.localeCompare(b))) {
    const [, w] = entry;
    if (!best) {
      best = entry;
      continue;
    }
    const b = best[1];
    const wr = w.remaining ?? Infinity;
    const br = b.remaining ?? Infinity;
    if (wr < br || (wr === br && (w.reset ?? 0) > (b.reset ?? 0))) best = entry;
  }
  if (!best) return undefined;
  return { ...best[1], window: best[0], windows };
}

/** Attach `lastResponse` to an object without it showing up in `JSON.stringify`, spreads or `Object.keys`. */
export function attachLastResponse<T>(data: T, meta: LastResponse): T {
  if (data && typeof data === "object" && Object.isExtensible(data) && !(data instanceof Response)) {
    Object.defineProperty(data, "lastResponse", {
      value: meta,
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }
  return data;
}

export class APIPromise<T> extends Promise<T> {
  #raw: Promise<RawResult>;
  #parse: (raw: RawResult) => Promise<T>;
  #parsed: Promise<WithResponse<T>> | undefined;

  constructor(raw: Promise<RawResult>, parse: (raw: RawResult) => Promise<T>) {
    // The executor is a placeholder: then/catch/finally below delegate to
    // the parsed result, so this base promise never carries the value.
    super((resolve) => resolve(null as T));
    this.#raw = raw;
    this.#parse = parse;
  }

  // `.then()` on a subclass must produce plain promises, not new APIPromises.
  static override get [Symbol.species]() {
    return Promise;
  }

  #withParsed(): Promise<WithResponse<T>> {
    if (!this.#parsed) {
      this.#parsed = this.#raw.then(async (raw) => ({
        data: await this.#parse(raw),
        response: raw.response,
        requestId: raw.requestId,
        rateLimit: parseRateLimit(raw.response.headers),
      }));
    }
    return this.#parsed;
  }

  /** The parsed body plus the `Response`, request id and rate-limit headers. */
  withResponse(): Promise<WithResponse<T>> {
    return this.#withParsed();
  }

  /** The raw `Response`, body unread. Use instead of awaiting (the body can only be read once). */
  asResponse(): Promise<Response> {
    return this.#raw.then((r) => r.response);
  }

  override then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.#withParsed().then((r) => r.data).then(onfulfilled, onrejected);
  }

  override catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T | R> {
    return this.then(undefined, onrejected);
  }

  override finally(onfinally?: (() => void) | null): Promise<T> {
    return this.then().finally(onfinally);
  }
}

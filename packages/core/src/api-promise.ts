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

/** Parsed `X-RateLimit-*` headers. Fields are `undefined` when the header is absent. */
export interface RateLimitInfo {
  limit: number | undefined;
  remaining: number | undefined;
  /** As sent by the server (seconds until reset, or a unix timestamp, per API). */
  reset: number | undefined;
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

export function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = num(headers.get("x-ratelimit-limit"));
  const remaining = num(headers.get("x-ratelimit-remaining"));
  const reset = num(headers.get("x-ratelimit-reset"));
  if (limit === undefined && remaining === undefined && reset === undefined) return undefined;
  return { limit, remaining, reset };
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

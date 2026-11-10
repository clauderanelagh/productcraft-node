/**
 * The error hierarchy every ProductCraft SDK throws.
 *
 * Every class is branded with `Symbol.for("productcraft.error.<Name>")`
 * and answers `instanceof` through `static [Symbol.hasInstance]`, so a
 * check like `err instanceof NotFoundError` holds even when the error
 * was thrown by the CJS build and the check runs against the ESM build,
 * or when two copies of `@productcraft/core` are installed.
 */

/** Base URL of the public error-code catalogue. */
export const ERROR_DOCS_URL = "https://productcraft.co/docs/errors";

/** A string-literal union that also accepts values this SDK version does not know. */
export type OpenEnum<T extends string> = T | (string & {});

/** One invalid request field, from the error envelope's `errors` list. */
export interface ErrorParam {
  /** The request field, e.g. `to` or `domains[0].name`. */
  param: string;
  message: string;
  code?: string;
}

const brandKey = (name: string): symbol => Symbol.for(`productcraft.error.${name}`);

function stamp(instance: object, ctor: unknown): void {
  // Walk the constructor chain and stamp one brand per class, so the
  // instance answers `instanceof` for itself and every ancestor.
  let current = ctor as { brandName?: string } | null;
  while (current && current !== Error && current !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(current, "brandName") && current.brandName) {
      Object.defineProperty(instance, brandKey(current.brandName), {
        value: true,
        enumerable: false,
      });
    }
    current = Object.getPrototypeOf(current);
  }
}

/** Base class of every error the SDK throws. */
export class ProductCraftError extends Error {
  static readonly brandName: string = "ProductCraftError";

  static override [Symbol.hasInstance](instance: unknown): boolean {
    if (typeof instance !== "object" || instance === null) return false;
    return (instance as Record<symbol, unknown>)[brandKey(this.brandName)] === true;
  }

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    const ctor = new.target as unknown as { brandName: string };
    Object.defineProperty(this, "name", {
      value: ctor.brandName,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    stamp(this, new.target);
  }
}

/** The client was configured in a way that cannot work (missing `workspaceId`, a key in a browser, ...). */
export class ConfigurationError extends ProductCraftError {
  static override readonly brandName: string = "ConfigurationError";
}

/** A webhook payload failed signature or timestamp verification. */
export class WebhookVerificationError extends ProductCraftError {
  static override readonly brandName: string = "WebhookVerificationError";
}

/** The request never produced an HTTP response (DNS, TLS, reset connection, ...). */
export class APIConnectionError extends ProductCraftError {
  static override readonly brandName: string = "APIConnectionError";
  constructor(message = "Connection error.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** An attempt (or a poll) ran past its timeout. */
export class APITimeoutError extends APIConnectionError {
  static override readonly brandName: string = "APITimeoutError";
  constructor(message = "Request timed out.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The caller's `AbortSignal` fired. Never retried. */
export class APIUserAbortError extends ProductCraftError {
  static override readonly brandName: string = "APIUserAbortError";
  constructor(message = "Request was aborted.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

interface ErrorEnvelope {
  message?: unknown;
  code?: unknown;
  request_id?: unknown;
  errors?: unknown;
  details?: unknown;
  error?: unknown;
}

function envelopeMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const msg = (body as ErrorEnvelope).message;
    if (typeof msg === "string" && msg !== "") return msg;
    if (Array.isArray(msg) && msg.length > 0) return msg.map(String).join("; ");
    const err = (body as ErrorEnvelope).error;
    if (typeof err === "string" && err !== "") return err;
  }
  if (typeof body === "string" && body.trim() !== "" && body.length <= 500) return body.trim();
  return `${status} status code`;
}

function envelopeErrors(body: unknown): ErrorParam[] {
  if (!body || typeof body !== "object") return [];
  const list = (body as ErrorEnvelope).errors;
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => {
      const out: ErrorParam = {
        param: typeof e.param === "string" ? e.param : "",
        message: typeof e.message === "string" ? e.message : "",
      };
      if (typeof e.code === "string") out.code = e.code;
      return out;
    });
}

/** A non-2xx HTTP response. Subclassed by status. */
export class APIError extends ProductCraftError {
  static override readonly brandName: string = "APIError";

  /** HTTP status of the response. */
  readonly status: number;
  /** Stable, machine-readable code from the error envelope (branch on this, not on `message`). */
  readonly code: string | undefined;
  /** Per-field validation errors from the envelope's `errors`; empty when absent. */
  readonly errors: ErrorParam[];
  /** The envelope's route-specific `details` object (e.g. `{ fqdn, reason }`), when present. */
  readonly details: Record<string, unknown> | undefined;
  /** `https://productcraft.co/docs/errors#<code>`, when there is a code. */
  readonly docUrl: string | undefined;
  /** `X-Request-Id` response header, else the envelope's `request_id`. Quote it to support. */
  readonly requestId: string | undefined;
  /** Response headers. */
  readonly headers: Headers;
  /** Parsed response body (JSON when it parses, otherwise the text). */
  readonly body: unknown;

  constructor(status: number, body: unknown, headers: Headers, message?: string) {
    super(message ?? envelopeMessage(body, status));
    this.status = status;
    this.headers = headers;
    this.body = body;
    const env = (body && typeof body === "object" ? body : {}) as ErrorEnvelope;
    this.code = typeof env.code === "string" && env.code !== "" ? env.code : undefined;
    this.errors = envelopeErrors(body);
    this.details =
      env.details && typeof env.details === "object" && !Array.isArray(env.details)
        ? (env.details as Record<string, unknown>)
        : undefined;
    this.docUrl = this.code ? `${ERROR_DOCS_URL}#${this.code}` : undefined;
    this.requestId =
      headers.get("x-request-id") ??
      (typeof env.request_id === "string" ? env.request_id : undefined);
  }

  /** Build the right subclass for a status and envelope. */
  static generate(status: number, body: unknown, headers: Headers): APIError {
    const code =
      body && typeof body === "object" && typeof (body as ErrorEnvelope).code === "string"
        ? ((body as ErrorEnvelope).code as string)
        : undefined;
    switch (status) {
      case 400:
        return new BadRequestError(status, body, headers);
      case 401:
        return new AuthenticationError(status, body, headers);
      case 402:
        return new PaymentRequiredError(status, body, headers);
      case 403:
        return new PermissionDeniedError(status, body, headers);
      case 404:
        return new NotFoundError(status, body, headers);
      case 409:
        return code === "IDEMPOTENCY_KEY_REUSE"
          ? new IdempotencyKeyReuseError(status, body, headers)
          : new ConflictError(status, body, headers);
      case 422:
        return new UnprocessableEntityError(status, body, headers);
      case 429:
        return new RateLimitError(status, body, headers);
    }
    if (status >= 500) return new InternalServerError(status, body, headers);
    // `this`, not `APIError`: a class body that names itself is renamed by bundlers (`_APIError`).
    return new this(status, body, headers);
  }
}

export class BadRequestError extends APIError {
  static override readonly brandName: string = "BadRequestError";
}
export class AuthenticationError extends APIError {
  static override readonly brandName: string = "AuthenticationError";
}
/**
 * 402: the workspace is out of the balance the call spends, e.g. Trawl's
 * `TRAWL_CREDITS_EXHAUSTED` when a job is created at zero credits. Not
 * retried: it does not clear until credits are added.
 */
export class PaymentRequiredError extends APIError {
  static override readonly brandName: string = "PaymentRequiredError";
}
export class PermissionDeniedError extends APIError {
  static override readonly brandName: string = "PermissionDeniedError";
}
export class NotFoundError extends APIError {
  static override readonly brandName: string = "NotFoundError";
}
export class ConflictError extends APIError {
  static override readonly brandName: string = "ConflictError";
}
/** 409 `IDEMPOTENCY_KEY_REUSE`: the same Idempotency-Key was sent with a different body. */
export class IdempotencyKeyReuseError extends ConflictError {
  static override readonly brandName: string = "IdempotencyKeyReuseError";
}
export class UnprocessableEntityError extends APIError {
  static override readonly brandName: string = "UnprocessableEntityError";
}
/** 429. `retryAfter` is the server's `Retry-After`, in seconds, when sent. */
export class RateLimitError extends APIError {
  static override readonly brandName: string = "RateLimitError";
  readonly retryAfter: number | undefined;
  constructor(status: number, body: unknown, headers: Headers, message?: string) {
    super(status, body, headers, message);
    const ms = parseRetryAfterMs(headers, Date.now());
    this.retryAfter = ms === undefined ? undefined : ms / 1000;
  }
}
/** Any 5xx. */
export class InternalServerError extends APIError {
  static override readonly brandName: string = "InternalServerError";
}

/**
 * Milliseconds the server asked us to wait: `retry-after-ms`, else
 * `Retry-After` as seconds or an HTTP date. `undefined` when absent or
 * unparseable; negative dates clamp to 0.
 */
export function parseRetryAfterMs(headers: Headers, now: number): number | undefined {
  const ms = headers.get("retry-after-ms");
  if (ms !== null && ms.trim() !== "") {
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const value = headers.get("retry-after");
  if (value === null || value.trim() === "") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

// No class in this file names itself in its own body, so bundlers keep every class name
// (`err.constructor.name`); tests/errors.test.ts and scripts/smoke-dist.mjs check it. With no
// top-level statement here, an app that imports one error class does not bundle the others.

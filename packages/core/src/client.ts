/**
 * `APIClient`: the hand-written runtime every generated resource method
 * calls. Nothing per-endpoint lives here (docs/sdk-standard.md section 4).
 */

import createClient, { type Client } from "openapi-fetch";
import {
  APIPromise,
  attachLastResponse,
  type LastResponse,
  type RawResult,
} from "./api-promise.js";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  ConfigurationError,
  ProductCraftError,
  parseRetryAfterMs,
} from "./errors.js";
import { authMiddleware, PC_BASE_URL, readEnv, resolveAuth, type PCAuth } from "./legacy.js";
import { Page, PagePromise, type PageResponse } from "./pagination.js";
import { CORE_VERSION } from "./version.js";
import {
  signWebhook,
  verifyWebhook,
  type SignedWebhook,
  type SignWebhookParams,
  type WebhookHeaders,
  type WebhookPayload,
} from "./webhooks.js";

export type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type LogLevel = "off" | "warn" | "debug";

/** Anything with pino- or console-shaped methods. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ClientOptions {
  /** Workspace API key (`pcft_live_…`). Falls back to `PRODUCTCRAFT_API_KEY`. Shorthand for `auth: { type: "apiKey", key }`. */
  apiKey?: string;
  /** Explicit credential (API key, bearer token or cookie). Wins over `apiKey`. */
  auth?: PCAuth;
  /** Override the product's base URL. */
  baseUrl?: string;
  /**
   * Default `{workspace_id}`: the workspace UUID, or its slug (`acme-corp`, as the console shows it),
   * which is resolved to the UUID once per process. Falls back to `PRODUCTCRAFT_WORKSPACE_ID`, then
   * (workspace API keys only) one cached `GET /v1/api-keys/self` lookup per process.
   */
  workspaceId?: string;
  /** Per-attempt timeout in ms. Default 60 000. */
  timeout?: number;
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number;
  /** Custom `fetch` (custom transports, tracing). Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Headers sent on every request. */
  defaultHeaders?: Record<string, string>;
  /** Allow a workspace API key in a browser. Leaks the key to anyone who loads the page. */
  dangerouslyAllowBrowser?: boolean;
  /** `off` (default), `warn` or `debug`. Falls back to `PRODUCTCRAFT_LOG`. */
  logLevel?: LogLevel;
  /** Where log lines go. Default `console`. Never receives headers or bodies. */
  logger?: Logger;
  /** Default secret(s) for `webhooks.unwrap`. */
  webhookSecret?: string | readonly string[];
  /** Platform-auth host used for the workspace lookup. */
  platformAuthBaseUrl?: string;
  /**
   * Read `PRODUCTCRAFT_API_KEY` when neither `auth` nor `apiKey` is passed. Default `true`.
   * Auth's consumer scope sets `false`: routes acting for an end user never pick up a workspace key.
   */
  credentialFromEnv?: boolean;
}

/** Per-request options: always the last argument of an SDK method. */
export interface RequestOptions {
  /** Overrides the automatic Idempotency-Key (and makes a POST/PATCH retryable). */
  idempotencyKey?: string;
  /** Per-attempt timeout in ms. */
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** `{workspace_id}` for this call (bearer tokens that span workspaces): a UUID or a workspace slug. */
  workspaceId?: string;
  fetch?: typeof fetch;
}

/** What a generated method hands to `request()`. */
export interface RequestSpec {
  method: HTTPMethod;
  /** Path template, e.g. `/v1/workspaces/{workspace_id}/domains/{id}`. */
  path: string;
  pathParams?: Record<string, string | number | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  /** The spec declares an `Idempotency-Key` header on this operation. */
  idempotent?: boolean;
  /** The success response is not JSON: resolve to the raw `Response`. */
  raw?: boolean;
  /** Keyless, browser-safe route: send no credential. */
  public?: boolean;
}

export interface PollConfig {
  /** Field whose value decides completion, e.g. `status`. */
  field: string;
  /** Values that end the poll. */
  terminal: readonly string[];
}

export interface PollOptions extends RequestOptions {
  /** Delay between polls in ms, unless the server sends `Retry-After`. Default 2 000. */
  intervalMs?: number;
  /** Give up after this many ms. Default 300 000. */
  timeoutMs?: number;
}

/** Identifies the product package in `User-Agent`. */
export interface SDKIdentity {
  name: string;
  version: string;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
/** Retry-After above this fails fast instead of waiting. */
export const MAX_RETRY_AFTER_MS = 60_000;
export const PC_WORKSPACE_ID_ENV = "PRODUCTCRAFT_WORKSPACE_ID";
export const PC_LOG_ENV = "PRODUCTCRAFT_LOG";
const WORKSPACE_LOOKUP_TIMEOUT_MS = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A platform workspace slug: lowercase alphanumerics separated by hyphens, 2..64 chars. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set<HTTPMethod>(["GET", "PUT", "DELETE"]);

/** Full-jitter exponential backoff: random in [0, min(8 s, 0.5 s * 2^attempt)). */
export function backoffMs(attempt: number): number {
  return Math.random() * Math.min(8_000, 500 * 2 ** attempt);
}

function isBrowser(): boolean {
  const g = globalThis as { window?: { document?: unknown }; navigator?: unknown };
  return typeof g.window !== "undefined" && typeof g.window?.document !== "undefined" && typeof g.navigator !== "undefined";
}

function runtimeTag(): string {
  const g = globalThis as {
    Bun?: { version?: string };
    Deno?: { version?: { deno?: string } };
    process?: { versions?: { node?: string } };
  };
  if (g.Bun?.version) return `bun/${g.Bun.version}`;
  if (g.Deno?.version?.deno) return `deno/${g.Deno.version.deno}`;
  if (g.process?.versions?.node) return `node/${g.process.versions.node}`;
  return "runtime/unknown";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new APIUserAbortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new APIUserAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isBodyInit(body: unknown): boolean {
  return (
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  );
}

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// The client's custom fetch, for createOpenAPIClient (kept off the instance's public surface).
const customFetch = new WeakMap<object, typeof fetch | undefined>();

/**
 * The typed `openapi-fetch` escape hatch (`.client` on every product), over
 * the same credential and base URL as `api`. It does not retry.
 * A standalone function so bundles that never use it leave openapi-fetch out.
 */
export function createOpenAPIClient<TPaths extends object>(api: APIClient): Client<TPaths> {
  const client = createClient<TPaths>({ baseUrl: api.baseUrl, fetch: customFetch.get(api) });
  client.use(authMiddleware(api.auth));
  return client;
}

// One shared lookup per (platform host, key) per process, kept on a global symbol so
// duplicate copies of core (two product packages on different core versions) share it too.
const workspaceCache: Map<string, Promise<string>> = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("productcraft.workspaceCache")
] ??= new Map<string, Promise<string>>()) as Map<string, Promise<string>>;

/** Clears the per-process workspace lookup cache. For tests. */
export function _resetWorkspaceCache(): void {
  workspaceCache.clear();
}

export class APIClient {
  readonly baseUrl: string;
  /** The resolved credential. Non-enumerable, so logging the client does not print the key. */
  declare readonly auth: PCAuth | undefined;
  readonly workspaceId: string | undefined;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly webhookSecret: string | readonly string[] | undefined;
  readonly #fetch: typeof fetch | undefined;
  readonly #defaultHeaders: Record<string, string>;
  readonly #platformAuthBaseUrl: string;
  readonly #logLevel: LogLevel;
  readonly #logger: Logger;
  readonly #userAgent: string;

  constructor(options: ClientOptions = {}, defaultBaseUrl: string, sdk?: SDKIdentity) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
    Object.defineProperty(this, "auth", {
      value: ((explicit: PCAuth | undefined) => (options.credentialFromEnv === false ? explicit : resolveAuth(explicit)))(
        options.auth ?? (options.apiKey ? { type: "apiKey", key: options.apiKey } : undefined),
      ),
      enumerable: false,
      writable: false,
    });
    if (this.auth?.type === "apiKey" && isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new ConfigurationError(
        "A workspace API key was used in a browser, where anyone who loads the page can read it. " +
          "Call ProductCraft from your server, or pass dangerouslyAllowBrowser: true if you accept that risk.",
      );
    }
    this.workspaceId = options.workspaceId ?? readEnv(PC_WORKSPACE_ID_ENV);
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.webhookSecret = options.webhookSecret;
    this.#fetch = options.fetch;
    customFetch.set(this, options.fetch);
    this.#defaultHeaders = { ...options.defaultHeaders };
    this.#platformAuthBaseUrl = (options.platformAuthBaseUrl ?? PC_BASE_URL.platformAuth).replace(/\/+$/, "");
    const level = options.logLevel ?? (readEnv(PC_LOG_ENV) as LogLevel | undefined);
    this.#logLevel = level === "debug" || level === "warn" ? level : "off";
    this.#logger = options.logger ?? console;
    const product = sdk ? `${sdk.name}@${sdk.version}` : `core@${CORE_VERSION}`;
    this.#userAgent = `productcraft-node/${product} ${runtimeTag()}`;
  }

  #log(level: "debug" | "warn", message: string, fields: Record<string, unknown>): void {
    if (this.#logLevel === "off") return;
    if (level === "debug" && this.#logLevel !== "debug") return;
    try {
      this.#logger[level](`[productcraft] ${message}`, fields);
    } catch {
      // A broken logger must never break a request.
    }
  }

  /** Send one logical API call (with retries). Resolves to the parsed body. */
  request<T>(spec: RequestSpec, options: RequestOptions = {}): APIPromise<T> {
    return new APIPromise<T>(this.#send(spec, options), (raw) => this.#parseBody<T>(spec, raw));
  }

  /** A paginated list call. `await` for one page, `for await` for every item. */
  list<Item>(spec: RequestSpec, options: RequestOptions = {}): PagePromise<Item> {
    // `used`: every cursor sent on the way to this page, so a repeated
    // `next_cursor` (an API that ignores the cursor) stops the walk.
    const at = (cursor: string | undefined, used: readonly string[]): PagePromise<Item> => {
      const pageSpec: RequestSpec = cursor === undefined ? spec : { ...spec, query: { ...spec.query, cursor } };
      return new PagePromise<Item>(this.#send(pageSpec, options), async (raw) => {
        const body = await this.#parseBody<PageResponse<Item>>(pageSpec, raw);
        const page = new Page<Item>(body as PageResponse<Item>, (next) => at(next, [...used, next]), used);
        return attachLastResponse(page, this.#meta(raw));
      });
    };
    const first = spec.query?.cursor;
    return at(undefined, typeof first === "string" && first !== "" ? [first] : []);
  }

  /** Retrieve repeatedly until `config.field` reaches a terminal value. */
  async poll<T>(spec: RequestSpec, config: PollConfig, options: PollOptions = {}): Promise<T> {
    const { intervalMs = 2_000, timeoutMs = 300_000, ...requestOptions } = options;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { data, response } = await this.request<T>(spec, requestOptions).withResponse();
      const value = (data as Record<string, unknown> | undefined)?.[config.field];
      if (typeof value === "string" && config.terminal.includes(value)) return data;
      const retryAfter = parseRetryAfterMs(response.headers, Date.now());
      const wait = retryAfter !== undefined && retryAfter <= MAX_RETRY_AFTER_MS ? retryAfter : intervalMs;
      if (Date.now() + wait > deadline) {
        throw new APITimeoutError(
          `Polling ${spec.path} timed out after ${timeoutMs} ms; last ${config.field} was ${JSON.stringify(value)}.`,
        );
      }
      this.#log("debug", "poll", { path: spec.path, [config.field]: value, wait_ms: wait });
      await sleep(wait, options.signal);
    }
  }

  /** Create, then poll the created object to a terminal state. */
  async createAndPoll<T>(
    createSpec: RequestSpec,
    retrieveSpec: (created: T) => RequestSpec,
    config: PollConfig,
    options: PollOptions = {},
  ): Promise<T> {
    const { intervalMs, timeoutMs, ...requestOptions } = options;
    const created = await this.request<T>(createSpec, requestOptions);
    const value = (created as Record<string, unknown> | undefined)?.[config.field];
    if (typeof value === "string" && config.terminal.includes(value)) return created;
    // The create's idempotency key must not leak into the retrieves.
    const pollOptions: PollOptions = { ...requestOptions, intervalMs, timeoutMs };
    delete pollOptions.idempotencyKey;
    return this.poll<T>(retrieveSpec(created), config, pollOptions);
  }

  /** Verify a webhook with the given secret, the client's `webhookSecret`, or `envVar`. */
  async unwrapWebhook<T = unknown>(
    params: { payload: WebhookPayload; headers: WebhookHeaders; secret?: string | readonly string[]; toleranceSeconds?: number },
    envVar?: string,
  ): Promise<T> {
    const secret = params.secret ?? this.webhookSecret ?? (envVar ? readEnv(envVar) : undefined);
    if (!secret || (Array.isArray(secret) && secret.length === 0)) {
      throw new ConfigurationError(
        `No webhook secret: pass { secret }, set webhookSecret on the client${envVar ? ` or ${envVar}` : ""}.`,
      );
    }
    return verifyWebhook<T>({ ...params, secret });
  }

  /** Sign a test payload with `params.secret`, else `webhookSecret`, else `envVar` (`webhooks.sign`). */
  async signWebhook(
    params: Omit<SignWebhookParams, "secret"> & { secret?: string },
    envVar?: string,
  ): Promise<SignedWebhook> {
    const fallback = Array.isArray(this.webhookSecret) ? this.webhookSecret[0] : this.webhookSecret;
    const secret = params.secret ?? (fallback as string | undefined) ?? (envVar ? readEnv(envVar) : undefined);
    if (!secret) {
      throw new ConfigurationError(
        `No webhook secret: pass { secret }, set webhookSecret on the client${envVar ? ` or ${envVar}` : ""}.`,
      );
    }
    return signWebhook({ ...params, secret });
  }

  #meta(raw: RawResult): LastResponse {
    return { requestId: raw.requestId, status: raw.response.status, headers: raw.response.headers };
  }

  async #parseBody<T>(spec: RequestSpec, raw: RawResult): Promise<T> {
    const res = raw.response;
    if (spec.raw) return res as T;
    if (res.status === 204 || res.status === 205) return undefined as T;
    const type = res.headers.get("content-type") ?? "";
    if (!/[/+]json\b/i.test(type)) {
      // An empty body with no content type is a void success; anything else non-JSON is handed back raw.
      if (res.headers.get("content-length") === "0") return undefined as T;
      return res as T;
    }
    const text = await res.text();
    if (text === "") return undefined as T;
    const data = JSON.parse(text) as T;
    return attachLastResponse(data, this.#meta(raw));
  }

  async #resolveWorkspaceId(options: RequestOptions, fetchImpl: typeof fetch): Promise<string> {
    const given = options.workspaceId || this.workspaceId;
    if (given) return this.#workspaceUuid(given, fetchImpl);
    if (this.auth?.type !== "apiKey") {
      throw new ConfigurationError(
        "pass workspaceId: this call is workspace-scoped and the credential is not a workspace API key " +
          "(bearer and cookie credentials can span workspaces, so the SDK never guesses).",
      );
    }
    const key = this.auth.key;
    const cacheKey = `${this.#platformAuthBaseUrl}\u0000${key}`;
    let pending = workspaceCache.get(cacheKey);
    if (!pending) {
      pending = this.#lookupWorkspace(key, fetchImpl);
      workspaceCache.set(cacheKey, pending);
      pending.catch(() => workspaceCache.delete(cacheKey));
    }
    return pending;
  }

  /**
   * Every workspace-scoped route takes the workspace UUID. A slug (what the
   * console shows) is looked up once per process: on platform-auth with the
   * client's own bearer token or cookie, or checked against the key's own
   * workspace for an API key.
   */
  async #workspaceUuid(value: string, fetchImpl: typeof fetch): Promise<string> {
    if (UUID_RE.test(value)) return value;
    const auth = this.auth;
    if (!SLUG_RE.test(value) || !auth) {
      throw new ConfigurationError(
        `workspaceId must be a workspace UUID or slug; got ${JSON.stringify(value)}` +
          (auth ? "." : " (a slug also needs a credential to look it up)."),
      );
    }
    const credential = auth.type === "apiKey" ? auth.key : auth.type === "cookie" ? auth.value : auth.token;
    const cacheKey = `${this.#platformAuthBaseUrl}\u0000${value}\u0000${credential}`;
    let pending = workspaceCache.get(cacheKey);
    if (!pending) {
      pending = this.#lookupSlug(value, auth, fetchImpl);
      workspaceCache.set(cacheKey, pending);
      pending.catch(() => workspaceCache.delete(cacheKey));
    }
    return pending;
  }

  async #lookupSlug(slug: string, auth: PCAuth, fetchImpl: typeof fetch): Promise<string> {
    const failed = `workspaceId ${JSON.stringify(slug)} is a slug, and resolving it to the workspace UUID failed`;
    if (auth.type === "apiKey") {
      // An API key belongs to one workspace: accept its slug, refuse any other.
      const ws = await this.#keyWorkspace(auth.key, fetchImpl, failed);
      if (ws.slug === slug) return ws.id;
      throw new ConfigurationError(`workspaceId ${JSON.stringify(slug)} does not match this API key's workspace (${JSON.stringify(ws.slug)}).`);
    }
    const header: Record<string, string> =
      auth.type === "cookie" ? { Cookie: `auth_token=${auth.value}` } : { Authorization: `Bearer ${auth.token}` };
    const body = await this.#platformGet(`/v1/workspaces/${encodeURIComponent(slug)}`, header, fetchImpl, failed);
    const id = (body as { id?: unknown } | undefined)?.id;
    if (typeof id !== "string" || !UUID_RE.test(id)) throw new ConfigurationError(`${failed}: no workspace id came back.`);
    return id;
  }

  async #keyWorkspace(key: string, fetchImpl: typeof fetch, failed: string): Promise<{ id: string; slug?: unknown }> {
    const body = await this.#platformGet("/v1/api-keys/self", { Authorization: `Bearer ${key}` }, fetchImpl, failed);
    const ws = (body as { workspace?: { id?: unknown; slug?: unknown } } | undefined)?.workspace;
    if (typeof ws?.id !== "string" || ws.id === "") throw new ConfigurationError(`${failed}: the API key lookup returned no workspace id.`);
    return ws as { id: string; slug?: unknown };
  }

  /** GET a platform-auth path; any failure is a `ConfigurationError` starting with `failed` (the API error as cause). */
  async #platformGet(path: string, auth: Record<string, string>, fetchImpl: typeof fetch, failed: string): Promise<unknown> {
    this.#log("debug", "resolving workspaceId", { path });
    let res: Response;
    try {
      res = await fetchImpl(`${this.#platformAuthBaseUrl}${path}`, {
        method: "GET",
        headers: { ...auth, Accept: "application/json", "User-Agent": this.#userAgent },
        signal: AbortSignal.timeout(WORKSPACE_LOOKUP_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new ConfigurationError(`${failed}.`, { cause });
    }
    if (!res.ok) {
      const cause = APIError.generate(res.status, await readErrorBody(res), res.headers);
      throw new ConfigurationError(
        `${failed} with ${res.status}${res.status === 404 && path.startsWith("/v1/workspaces/") ? " (no such workspace, or you are not a member)" : ""}.`,
        { cause },
      );
    }
    return res.json().catch(() => undefined);
  }

  async #lookupWorkspace(key: string, fetchImpl: typeof fetch): Promise<string> {
    return (await this.#keyWorkspace(key, fetchImpl, "pass workspaceId: looking it up from the API key failed")).id;
  }

  async #buildUrl(spec: RequestSpec, options: RequestOptions, fetchImpl: typeof fetch): Promise<string> {
    const params: Record<string, string | number | undefined> = { ...spec.pathParams };
    if (spec.path.includes("{workspace_id}") && params.workspace_id === undefined) {
      params.workspace_id = await this.#resolveWorkspaceId(options, fetchImpl);
    }
    const path = spec.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const value = params[name];
      if (value === undefined || value === null || value === "") {
        throw new ProductCraftError(`Missing path parameter "${name}" for ${spec.method} ${spec.path}.`);
      }
      return encodeURIComponent(String(value));
    });
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(spec.query ?? {})) {
      if (v === undefined || v === null) continue;
      for (const item of Array.isArray(v) ? v : [v]) {
        if (item === undefined || item === null) continue;
        search.append(k, item instanceof Date ? item.toISOString() : typeof item === "object" ? JSON.stringify(item) : String(item));
      }
    }
    const qs = search.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  async #send(spec: RequestSpec, options: RequestOptions): Promise<RawResult> {
    const fetchImpl = options.fetch ?? this.#fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new ConfigurationError("No fetch implementation: pass { fetch } or use Node 20.3+.");
    }
    if (options.signal?.aborted) throw new APIUserAbortError();
    const url = await this.#buildUrl(spec, options, fetchImpl);

    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (!isBrowser()) headers.set("User-Agent", this.#userAgent);
    for (const source of [this.#defaultHeaders, spec.headers, options.headers]) {
      for (const [k, v] of Object.entries(source ?? {})) {
        if (v === undefined) headers.delete(k);
        else headers.set(k, v);
      }
    }
    if (!spec.public && this.auth) {
      if (this.auth.type === "cookie") headers.set("Cookie", `auth_token=${this.auth.value}`);
      else headers.set("Authorization", `Bearer ${this.auth.type === "apiKey" ? this.auth.key : this.auth.token}`);
    }

    // One key per logical call, reused on every retry.
    if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
    else if (spec.idempotent && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", `pc_${crypto.randomUUID()}`);

    let body: RequestInit["body"];
    if (spec.body !== undefined) {
      if (isBodyInit(spec.body)) body = spec.body as RequestInit["body"];
      else {
        body = JSON.stringify(spec.body);
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      }
    }

    // A POST/PATCH without a key is never retried: fetch cannot tell whether the bytes were sent.
    const retryable = SAFE_METHODS.has(spec.method) || headers.has("Idempotency-Key");
    const maxRetries = Math.max(0, options.maxRetries ?? this.maxRetries);
    const timeout = options.timeout ?? this.timeout;

    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) headers.set("X-PC-SDK-Retry-Count", String(attempt));
      const timeoutCtl = new AbortController();
      const timer = setTimeout(() => timeoutCtl.abort(), timeout);
      const signal = options.signal ? AbortSignal.any([options.signal, timeoutCtl.signal]) : timeoutCtl.signal;
      const canRetry = retryable && attempt < maxRetries;
      this.#log("debug", "request", { method: spec.method, path: spec.path, attempt });

      let res: Response;
      try {
        res = await fetchImpl(url, { method: spec.method, headers, body, signal });
      } catch (cause) {
        clearTimeout(timer);
        if (options.signal?.aborted) throw new APIUserAbortError(undefined, { cause });
        const error = timeoutCtl.signal.aborted
          ? new APITimeoutError(`Request timed out after ${timeout} ms.`, { cause })
          : new APIConnectionError(`Connection error: ${(cause as Error)?.message ?? String(cause)}`, { cause });
        if (!canRetry) throw error;
        const wait = backoffMs(attempt);
        this.#log("debug", "retrying after connection error", { method: spec.method, path: spec.path, attempt, wait_ms: Math.round(wait) });
        await sleep(wait, options.signal);
        continue;
      }
      clearTimeout(timer);
      const requestId = res.headers.get("x-request-id") ?? undefined;

      if (res.ok) {
        this.#log("debug", "response", { method: spec.method, path: spec.path, status: res.status, request_id: requestId, attempt });
        return { response: res, requestId };
      }

      const errorBody = await readErrorBody(res);
      const error = APIError.generate(res.status, errorBody, res.headers);
      this.#log("debug", "response", { method: spec.method, path: spec.path, status: res.status, request_id: error.requestId, attempt });
      const statusRetryable =
        RETRY_STATUSES.has(res.status) || (res.status === 409 && error.code === "IDEMPOTENCY_IN_PROGRESS");
      if (!canRetry || !statusRetryable) throw error;
      const retryAfter = parseRetryAfterMs(res.headers, Date.now());
      if (retryAfter !== undefined && retryAfter > MAX_RETRY_AFTER_MS) {
        this.#log("warn", "Retry-After above 60 s, not retrying", { path: spec.path, status: res.status, request_id: error.requestId });
        throw error;
      }
      const wait = retryAfter ?? backoffMs(attempt);
      this.#log("debug", "retrying", { method: spec.method, path: spec.path, status: res.status, attempt, wait_ms: Math.round(wait) });
      await sleep(wait, options.signal);
    }
  }
}

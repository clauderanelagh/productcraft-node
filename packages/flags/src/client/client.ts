// FlagsClient (design 8.2): downloads one config JSON per (config, environment) and evaluates flags
// locally with @productcraft/flags-engine. User attributes never leave the process.
//
// Fail-safe order: fresh download -> last-known in memory -> the pluggable cache (read at start-up)
// -> `bootstrap` -> the caller's default. `getValue` and friends never throw after construction.
// Kept small on purpose: the one-call bundle (this file, the engine and core) has a 10 KB gzip budget.

import { backoffMs, ConfigurationError, isBrowser, parseRetryAfterMs, ProductCraftError, runtimeTag, type Logger } from "@productcraft/core";
import { ConfigParseError, hashConfidential, isNewerConfig, parseConfig, type EvaluationDetails, type ParsedConfig, type SettingValue, type User } from "@productcraft/flags-engine";
import { isWellFormedSdkKey } from "./key.js";
import { combine, overrideSettings, parseOverrideText, put } from "./overrides.js";
import { envText, readText, watchFile } from "./platform.js";
import { resolve, resolveAll, toValues, type Layer } from "./resolve.js";
import type { ClientState, ConfigSource, FlagsClientErrorCode, FlagsClientEvents, FlagsClientOptions, FlagValue, OverrideBehaviour } from "./types.js";

declare const __PC_SDK_VERSION__: string | undefined;
const VERSION = typeof __PC_SDK_VERSION__ === "string" ? __PC_SDK_VERSION__ : "0.0.0-dev";
/** The delivery host (`PC_BASE_URL.flags` in `@productcraft/core`). */
const DEFAULT_BASE = "https://api.flags.productcraft.co";

/** The SDK refuses a config body over 2 MiB before parsing it (the API caps configs at 1 MiB). */
export const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

type Obj = Record<string, unknown>;
type Def = SettingValue | object | null;

/** A failure the client reports through the `error` event (it never throws them at callers). */
export class FlagsClientError extends ProductCraftError {
  static override readonly brandName: string = "FlagsClientError";
  readonly code: FlagsClientErrorCode;
  constructor(code: FlagsClientErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/**
 * Keeps only `https://<host>.productcraft.co` origins with no userinfo, port, path, query or fragment
 * (design 5, T7); every other entry is dropped and reported through `warn`.
 */
export function deliveryOrigins(urls: readonly string[], warn: (message: string) => void): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.productcraft\.co\/?$/.test(raw)) out.push(raw.replace(/\/$/, ""));
    else warn(`base_urls entry dropped: ${JSON.stringify(String(raw).slice(0, 99))}`);
  }
  return out;
}

/** A frozen view of one config for synchronous evaluation (`flags.snapshot()`). */
export class FlagsSnapshot {
  readonly #c: ParsedConfig | null;
  readonly #raw: Obj | null;
  readonly #user: User | undefined;
  readonly #layer: Layer;
  /** @internal */
  constructor(config: ParsedConfig | null, raw: Obj | null, user: User | undefined, layer: Layer) {
    this.#c = config;
    this.#raw = raw;
    this.#user = user;
    this.#layer = layer;
  }
  /** Revision of the config, 0 when there is none. */
  get revision(): number {
    return this.#c?.revision ?? 0;
  }
  /** Generation of the config (bumped after a database restore), 0 when there is none. */
  get generation(): number {
    return this.#c?.generation ?? 0;
  }
  /** Setting keys in config order. */
  keys(): string[] {
    return this.#c?.keys() ?? [];
  }
  getValue<D extends Def>(key: string, defaultValue: D, user?: User | null): FlagValue<D> {
    return this.getValueDetails(key, defaultValue, user).value;
  }
  getValueDetails<D extends Def>(key: string, defaultValue: D, user?: User | null): EvaluationDetails<FlagValue<D>> {
    return resolve(this.#c, key, defaultValue, user ?? this.#user, false, this.#layer) as EvaluationDetails<FlagValue<D>>;
  }
  getJson<T = unknown>(key: string, defaultValue: T, user?: User | null): T {
    return resolve(this.#c, key, defaultValue, user ?? this.#user, true, this.#layer).value;
  }
  getAllValues(user?: User | null): Record<string, unknown> {
    return toValues(resolveAll(this.#c, user ?? this.#user, this.#layer));
  }
  /** The config JSON this snapshot evaluates (overrides included), or null: pass it as another client's `bootstrap`. */
  toJSON(): Obj | null {
    return this.#raw;
  }
}

/** Sets one override and re-evaluates (createTestClient's `set`); not exported from the package. */
export let setOverride: (client: FlagsClient, key: string, value: unknown) => void;

const unref = <T>(t: T): T => ((t as { unref?: () => void }).unref?.(), t);
const cancel = (res: Response): void => void res.body?.cancel().catch(() => undefined);

/**
 * Feature flags and settings, evaluated locally.
 *
 * @example
 * ```ts
 * import { FlagsClient } from "@productcraft/flags";
 * const flags = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY });
 * const on = await flags.getValue("new_checkout", false, { identifier: "user-1" });
 * ```
 */
export class FlagsClient {
  readonly #key: string | null;
  readonly #mode: string;
  readonly #interval: number;
  readonly #initWait: number;
  readonly #timeout: number;
  readonly #fetch: typeof fetch;
  readonly #fixedBase: string | null;
  readonly #log: Logger | null;
  readonly #o: FlagsClientOptions;
  readonly #behaviour: OverrideBehaviour;
  readonly #on: { [E in keyof FlagsClientEvents]: Set<FlagsClientEvents[E]> } = { ready: new Set(), configChanged: new Set(), evaluated: new Set(), error: new Set() };
  readonly #warned = new Set<string>();
  #state: ClientState = "initializing";
  #source: ConfigSource = "none";
  /** The downloaded (or cached / bootstrap) config, parsed and as JSON for combining with overrides. */
  #remote: ParsedConfig | null = null;
  #remoteRaw: Obj | null = null;
  #etag: string | null = null;
  #fetchedAt = 0;
  /** Override values as given, and as config settings. */
  #overrideValues: Obj = {};
  #overrides: Obj | null = null;
  /** What evaluations use: the remote config combined with the overrides. */
  #config: ParsedConfig | null = null;
  #configRaw: Obj | null = null;
  #bases: string[];
  #user: User | undefined;
  #failures = 0;
  #retryAfter = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inflight: Promise<void> | null = null;
  #abort: AbortController | null = null;
  #offline: boolean;
  #closed = false;
  #unwatch: (() => void) | undefined;
  readonly #init: Promise<void>;

  constructor(options: FlagsClientOptions = {}) {
    const o = (this.#o = options);
    const ov = o.overrides;
    const p = o.polling ?? { mode: "auto" };
    this.#behaviour = ov?.behaviour ?? "local_over_remote";
    if (!/^(auto|lazy|manual)$/.test(p.mode) || !/^(local_only|local_over_remote|remote_over_local)$/.test(this.#behaviour)) {
      throw new ConfigurationError("bad polling.mode or overrides.behaviour");
    }
    const localOnly = !!ov && this.#behaviour === "local_only";
    // Without a key the client never downloads: local_only overrides, or an offline client over `bootstrap`.
    if (o.sdkKey === undefined ? !localOnly && !(o.offline && o.bootstrap !== undefined) : !isWellFormedSdkKey(o.sdkKey)) {
      throw new ConfigurationError("sdkKey is not a valid pcf_sdk_ key (check for a typo)");
    }
    this.#key = localOnly ? null : (o.sdkKey ?? null);
    this.#log = o.logger === null ? null : (o.logger ?? console);
    this.#fetch = o.fetch ?? ((...a) => fetch(...a));
    this.#fixedBase = o.baseUrl?.replace(/\/+$/, "") || null;
    this.#bases = [this.#fixedBase ?? DEFAULT_BASE];
    this.#timeout = o.timeout ?? 10_000;
    this.#user = o.defaultUser;
    this.#offline = o.offline === true;
    this.#mode = p.mode;
    const s = p.mode === "auto" ? p.intervalSeconds : p.mode === "lazy" ? p.ttlSeconds : undefined;
    if (s !== undefined && !(s >= 30)) this.#warn("i", `polling interval raised to the 30 s minimum`);
    this.#interval = Math.max(30, s ?? 60) * 1000 || 30_000;
    this.#initWait = Math.max(0, (p.mode === "auto" ? p.maxInitWaitSeconds : undefined) ?? 5) * 1000;

    // Synchronous sources first, so a value is available before the first await.
    if (o.bootstrap !== undefined) this.#adopt(o.bootstrap, "bootstrap", null, 0);
    if (ov && "values" in ov) this.#setOverrides(ov.values);
    else if (ov && "env" in ov) this.#overrideText(() => envText(ov.env) ?? "{}", `$${ov.env}`);
    this.#recompute(false);
    this.#init = this.#start();
  }

  /** `initializing`, `ready`, `stale`, `key_invalid`, `offline` or `closed`. */
  get state(): ClientState {
    return this.#state;
  }

  /** Subscribe to `ready`, `configChanged`, `evaluated` or `error`. Returns a function that unsubscribes. */
  on<E extends keyof FlagsClientEvents>(event: E, listener: FlagsClientEvents[E]): () => void {
    this.#on[event].add(listener);
    return () => this.off(event, listener);
  }

  off<E extends keyof FlagsClientEvents>(event: E, listener: FlagsClientEvents[E]): void {
    this.#on[event].delete(listener);
  }

  /** The user evaluations use when a call passes none. */
  setDefaultUser(user: User | undefined): void {
    this.#user = user;
  }

  /** The value of a flag or setting for a user; the default on any failure. Never throws. */
  async getValue<D extends Def>(key: string, defaultValue: D, user?: User | null): Promise<FlagValue<D>> {
    return (await this.getValueDetails(key, defaultValue, user)).value;
  }

  /** The value plus why: reason, matched rule or split, error code, warnings and revision. Never throws. */
  async getValueDetails<D extends Def>(key: string, defaultValue: D, user?: User | null): Promise<EvaluationDetails<FlagValue<D>>> {
    return this.#eval(key, defaultValue, user, false) as Promise<EvaluationDetails<FlagValue<D>>>;
  }

  /** A json (or string) setting, parsed. A parse failure, a missing key or another type returns the default. Never throws. */
  async getJson<T = unknown>(key: string, defaultValue: T, user?: User | null): Promise<T> {
    return (await this.#eval(key, defaultValue, user, true)).value;
  }

  /** Every setting's value for a user (json settings parsed), as a null-prototype object. Never throws. */
  async getAllValues(user?: User | null): Promise<Record<string, unknown>> {
    await this.#ensure();
    return toValues(resolveAll(this.#config, user ?? this.#user, this.#layer()).map((d) => this.#evaluated(d)));
  }

  /** The config as it is now, for synchronous evaluation. Does not wait for the first download. */
  snapshot(): FlagsSnapshot {
    return new FlagsSnapshot(this.#config, this.#configRaw, this.#user, this.#layer());
  }

  /** Resolves when start-up has settled: the first download finished or `maxInitWaitSeconds` passed. Never rejects. */
  async waitForReady(): Promise<ClientState> {
    await this.#init;
    return this.#state;
  }

  /** Downloads the config now (any polling mode). Resolves when the attempt settles; never rejects. */
  async forceRefresh(): Promise<void> {
    if (this.#closed || this.#offline || !this.#key) return;
    await this.#fetchNow();
    this.#schedule();
  }

  /** Stops all network access; evaluations keep using what is held. */
  setOffline(): void {
    if (this.#closed) return;
    this.#offline = true;
    this.#state = "offline";
    this.#stop();
  }

  /** Resumes network access after `setOffline()` (or the `offline` option). Auto polling fetches at once. */
  setOnline(): void {
    if (this.#closed || !this.#offline) return;
    this.#offline = false;
    this.#state = this.#remote ? "stale" : "initializing";
    if (this.#mode === "auto") void this.forceRefresh();
  }

  /** Stops timers, aborts a download in flight and stops watching an override file. Evaluations keep working on what is held. */
  close(): void {
    this.#closed = true;
    this.#state = "closed";
    this.#stop();
    this.#unwatch?.();
  }

  async #eval<T>(key: string, def: T, user: User | null | undefined, json: boolean): Promise<EvaluationDetails<T>> {
    await this.#ensure();
    return this.#evaluated(resolve(this.#config, key, def, user ?? this.#user, json, this.#layer()));
  }

  #stop(): void {
    clearTimeout(this.#timer);
    this.#abort?.abort();
  }

  async #start(): Promise<void> {
    // Let the caller attach listeners (`ready`, `error`) before anything is reported.
    await 0;
    const ov = this.#o.overrides;
    if (ov && "file" in ov) {
      await this.#loadFile(ov.file);
      try {
        if (ov.watch && !this.#closed) this.#unwatch = await watchFile(ov.file, () => void this.#loadFile(ov.file));
        if (this.#closed) this.#unwatch?.();
      } catch (e) {
        this.#error("overrides", "overrides file watch failed", e);
      }
    }
    await this.#readCache();
    if (this.#closed) {
      /* closed during start-up */
    } else if (!this.#key) this.#state = "ready";
    else if (this.#offline) this.#state = "offline";
    else if (this.#mode === "auto" || (this.#mode === "lazy" && this.#expired())) {
      await this.#deadline(this.forceRefresh(), this.#initWait);
      this.#schedule();
    }
    this.#emit("ready", this.#state);
  }

  async #deadline(p: Promise<void>, ms: number): Promise<void> {
    let t;
    await Promise.race([p, new Promise((ok) => (t = unref(setTimeout(ok, ms))))]);
    clearTimeout(t);
  }

  async #ensure(): Promise<void> {
    if (this.#state === "initializing") await this.#init;
    if (this.#mode === "lazy" && this.#key && !this.#offline && !this.#closed && this.#expired()) {
      const p = this.#fetchNow();
      if (!this.#remote) await this.#deadline(p, this.#timeout);
    }
  }

  #expired(): boolean {
    return Date.now() - this.#fetchedAt >= this.#interval;
  }

  #fetchNow(): Promise<void> {
    return (this.#inflight ??= this.#download().finally(() => (this.#inflight = null)));
  }

  /** Auto polling: the next download after the jittered interval, later after errors (at most 4x) or when the server asks (Retry-After). */
  #schedule(): void {
    clearTimeout(this.#timer);
    if (this.#closed || this.#offline || this.#mode !== "auto" || !this.#key) return;
    const i = this.#interval;
    let delay = i * (0.9 + 0.2 * Math.random());
    if (this.#failures) delay = Math.min(4 * i, delay + backoffMs(this.#failures));
    delay = Math.max(delay, this.#retryAfter);
    this.#timer = unref(setTimeout(() => void this.forceRefresh(), delay));
  }

  async #download(): Promise<void> {
    if (this.#closed || this.#offline || !this.#key) return;
    this.#retryAfter = 0;
    let failure: [FlagsClientErrorCode, string, unknown?] = ["network", "download failed"];
    for (const base of this.#bases) {
      const abort = (this.#abort = new AbortController());
      const timer = setTimeout(() => abort.abort(), this.#timeout);
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        // Browsers rely on their HTTP cache: a hand-set If-None-Match would force a CORS preflight (design 6.3).
        if (!isBrowser()) {
          headers["User-Agent"] = `productcraft-node/flags/${VERSION} ${runtimeTag()}`;
          if (this.#etag) headers["If-None-Match"] = this.#etag;
        }
        const res = await this.#fetch(`${base}/v1/configs/${encodeURIComponent(this.#key)}/config.json`, { headers, signal: abort.signal });
        if (res.status < 500) return await this.#handle(res);
        cancel(res);
        failure = ["http_status", `download failed: HTTP ${res.status}`];
      } catch (e) {
        if (this.#closed || this.#offline) return;
        // The message never carries the URL: it holds the SDK key.
        failure = ["network", `download failed: ${abort.signal.aborted ? "timeout" : (e as Error)?.name}`, e];
      } finally {
        clearTimeout(timer);
      }
    }
    this.#failed(...failure);
  }

  async #handle(res: Response): Promise<void> {
    const status = res.status;
    if (status === 304) return this.#succeeded();
    if (status !== 200) {
      cancel(res);
      this.#retryAfter = parseRetryAfterMs(res.headers, Date.now()) ?? 0;
      if (status !== 404) return this.#failed(status === 429 ? "rate_limited" : "http_status", `download failed: HTTP ${status}`);
      this.#failed("key_invalid", "SDK key unknown, revoked or expired (404)");
      if (!this.#closed && !this.#offline) this.#state = "key_invalid";
      return;
    }
    // Read with a byte cap: anything over 2 MiB is refused before it is parsed.
    const tooBig = (): void => this.#failed("too_large", "config over 2 MiB refused");
    if (Number(res.headers.get("content-length")) > MAX_CONFIG_BYTES) return cancel(res), tooBig();
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    for (let r; reader && !(r = await reader.read()).done; ) {
      if ((size += r.value.byteLength) > MAX_CONFIG_BYTES) return void reader.cancel().catch(() => undefined), tooBig();
      text += decoder.decode(r.value, { stream: true });
    }
    if (this.#adopt(text + decoder.decode(), "fetch", res.headers.get("etag"), Date.now()) !== false) this.#succeeded();
  }

  #succeeded(): void {
    this.#failures = 0;
    this.#fetchedAt = Date.now();
    if (!this.#closed && !this.#offline) this.#state = "ready";
  }

  #failed(code: FlagsClientErrorCode, message: string, cause?: unknown): void {
    this.#failures++;
    if (!this.#closed && !this.#offline) this.#state = "stale";
    this.#error(code, message, cause);
  }

  /**
   * Takes a config from any source when it is newer than the one held (never an older revision within a
   * generation). Returns false when the body was rejected, true when taken, undefined when older.
   */
  #adopt(input: string | object, source: ConfigSource, etag: string | null, fetchedAt: number): boolean | undefined {
    const fetched = source === "fetch";
    let raw: Obj;
    let parsed: ParsedConfig;
    try {
      raw = (typeof input === "string" ? JSON.parse(input) : input) as Obj;
      parsed = parseConfig(raw);
    } catch (e) {
      const args = [e instanceof ConfigParseError ? e.code : "PARSE_ERROR", `${source} config rejected: ${(e as Error).message}`, e] as const;
      if (fetched) this.#failed(...args);
      else this.#error(...args);
      return false;
    }
    if (!isNewerConfig(this.#remote, parsed)) return undefined;
    this.#remote = parsed;
    this.#remoteRaw = raw;
    this.#source = source;
    this.#etag = etag;
    this.#fetchedAt = fetchedAt;
    if (!this.#fixedBase) {
      const hinted = deliveryOrigins(parsed.delivery?.baseUrls ?? [], (m) => this.#warn(m, m));
      this.#bases = hinted.length ? hinted : [DEFAULT_BASE];
    }
    this.#recompute(true);
    if (fetched) void this.#writeCache(input as string);
    return true;
  }

  #setOverrides(values: Obj): void {
    this.#overrideValues = values;
    const { settings, skipped } = overrideSettings(values, (k) => this.#remote?.settingType(k));
    if (skipped.length) this.#error("overrides", `overrides skipped: ${skipped}`);
    this.#overrides = settings;
  }

  #overrideText(read: () => string, source: string): void {
    try {
      this.#setOverrides(parseOverrideText(read(), source));
    } catch (e) {
      this.#error("overrides", (e as Error).message, e);
    }
  }

  async #loadFile(path: string): Promise<void> {
    try {
      const text = await readText(path);
      this.#overrideText(() => text, "the overrides file");
      this.#recompute(true);
    } catch (e) {
      this.#error("overrides", "overrides file unreadable", e);
    }
  }

  /** Rebuilds the evaluated config from the remote one and the overrides. */
  #recompute(emit: boolean): void {
    const raw = combine(this.#remoteRaw, this.#overrides, this.#behaviour);
    let parsed = this.#remote;
    try {
      if (raw && raw !== this.#remoteRaw) parsed = parseConfig(raw);
    } catch (e) {
      this.#error("overrides", `overrides rejected: ${(e as Error).message}`, e);
    }
    this.#config = raw ? parsed : null;
    this.#configRaw = parsed === this.#remote ? this.#remoteRaw : raw;
    this.#warned.clear();
    if (emit && parsed) {
      const source = this.#overrides && (this.#behaviour === "local_only" || !this.#remote) ? "overrides" : this.#source;
      this.#emit("configChanged", { revision: parsed.revision, generation: parsed.generation, source });
    }
  }

  #cacheKey(): string {
    return `productcraft-flags:v1:${hashConfidential(this.#key!, "", "cache-key").slice(0, 32)}`;
  }

  async #readCache(): Promise<void> {
    const cache = this.#o.cache;
    if (!cache || !this.#key) return;
    try {
      const entry = await cache.get(this.#cacheKey());
      if (!entry) return;
      const { config, etag, fetched_at } = JSON.parse(entry) as { config: string; etag: string | null; fetched_at: number };
      this.#adopt(config, "cache", etag ?? null, Number(fetched_at) || 0);
    } catch (e) {
      this.#error("cache", "cache read failed", e);
    }
  }

  async #writeCache(text: string): Promise<void> {
    try {
      await this.#o.cache?.set(this.#cacheKey(), JSON.stringify({ config: text, etag: this.#etag, fetched_at: this.#fetchedAt }));
    } catch (e) {
      this.#error("cache", "cache write failed", e);
    }
  }

  #layer(): Layer {
    if (this.#source === "cache" || this.#source === "bootstrap") return this.#state === "ready" ? null : "CACHED";
    return this.#state === "stale" || this.#state === "key_invalid" ? "STALE" : null;
  }

  #evaluated<T>(d: EvaluationDetails<T>): EvaluationDetails<T> {
    for (const w of d.warnings) this.#warn(`${d.revision}|${w.key}|${w.code}`, `flag ${JSON.stringify(w.key)} (${w.code}): ${w.message}`);
    this.#emit("evaluated", d as EvaluationDetails<unknown>);
    return d;
  }

  /** Logs once per id (evaluation warnings: once per key, code and revision); id null logs always. A broken logger never breaks evaluation. */
  #warn(id: string | null, message: string): void {
    if (id !== null && this.#warned.has(id)) return;
    if (id !== null) this.#warned.add(id);
    try {
      this.#log?.warn(`[productcraft/flags] ${message}`);
    } catch {
      /* ignore */
    }
  }

  /** Emits `error`; logs it when nobody listens. */
  #error(code: FlagsClientErrorCode, message: string, cause?: unknown): void {
    if (!this.#on.error.size) this.#warn(null, message);
    this.#emit("error", new FlagsClientError(code, message, cause === undefined ? undefined : { cause }));
  }

  #emit<E extends keyof FlagsClientEvents>(event: E, arg: Parameters<FlagsClientEvents[E]>[0]): void {
    for (const listener of this.#on[event]) {
      try {
        (listener as (a: typeof arg) => void)(arg);
      } catch (e) {
        if (event !== "error") this.#error("listener", `a ${event} listener threw`, e);
      }
    }
  }

  static {
    setOverride = (client, key, value) => {
      client.#setOverrides(put({ ...client.#overrideValues }, key, value));
      client.#recompute(true);
    };
  }
}

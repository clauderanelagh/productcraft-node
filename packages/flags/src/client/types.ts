// Public option, event and result types of FlagsClient (design 8.2).

import type { Logger } from "@productcraft/core";
import type { EvaluationDetails, SettingValue, User } from "@productcraft/flags-engine";

/** Auto polling: fetch on a timer. Default 60 s, minimum 30 s, ±10% jitter. */
export interface AutoPolling {
  mode: "auto";
  /** Seconds between polls. Default 60; values under 30 are raised to 30 with a warning. */
  intervalSeconds?: number;
  /** How long `getValue` and `waitForReady` wait for the first fetch before serving the cache, `bootstrap` or defaults. Default 5. */
  maxInitWaitSeconds?: number;
}

/** Lazy polling: fetch on use once the config is older than `ttlSeconds`, serving the stale config meanwhile. No timers. */
export interface LazyPolling {
  mode: "lazy";
  /** Default 60; values under 30 are raised to 30 with a warning. */
  ttlSeconds?: number;
}

/** Manual polling: fetch only when you call `forceRefresh()`. */
export interface ManualPolling {
  mode: "manual";
}

export type PollingOptions = AutoPolling | LazyPolling | ManualPolling;

/**
 * A shared cache for the downloaded config (Redis, a KV store, a file), read once at start-up and written
 * after every accepted download. Keys never contain the SDK key itself.
 */
export interface FlagsCache {
  get(key: string): Promise<string | null | undefined> | string | null | undefined;
  set(key: string, value: string): Promise<void> | void;
}

/**
 * How overrides combine with the downloaded config.
 * - `local_only`: only the overrides; nothing is downloaded.
 * - `local_over_remote`: the overrides win for their keys; other keys come from the download.
 * - `remote_over_local`: the download wins; overrides only fill keys it does not have.
 */
export type OverrideBehaviour = "local_only" | "local_over_remote" | "remote_over_local";

/** A value an override may hold. Objects, arrays and `null` become `json` settings. */
export type OverrideValue = SettingValue | null | readonly unknown[] | { [key: string]: unknown };

/** Overrides from one source: a map, a JSON file (Node only) or an environment variable (Node only) holding a JSON object. */
export type FlagsOverrides =
  | { values: Record<string, OverrideValue>; behaviour?: OverrideBehaviour }
  | { file: string; watch?: boolean; behaviour?: OverrideBehaviour }
  | { env: string; behaviour?: OverrideBehaviour };

export interface FlagsClientOptions {
  /** The SDK key of one config and environment (`pcf_sdk_…`). Optional only with `local_only` overrides, or with `offline: true` and a `bootstrap` (the client then never downloads). */
  sdkKey?: string;
  /** Default `{ mode: "auto", intervalSeconds: 60, maxInitWaitSeconds: 5 }`. */
  polling?: PollingOptions;
  cache?: FlagsCache;
  /** A config JSON (text or object) to use when nothing fresher is available: the last line of defence before your defaults. */
  bootstrap?: string | object;
  overrides?: FlagsOverrides;
  /** The user evaluations are for when a call passes none. A call's own user replaces it as a whole. */
  defaultUser?: User;
  /** Where warnings and errors are logged. Default `console`. Pass `null` to log nothing. */
  logger?: Logger | null;
  /** Custom `fetch`. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Delivery host. Defaults to `https://api.flags.productcraft.co`; when set, `delivery.base_urls` hints are ignored. */
  baseUrl?: string;
  /** Start without network access (the cache, `bootstrap` and overrides still apply). `setOnline()` starts fetching. */
  offline?: boolean;
  /** Per-request timeout in ms. Default 10 000. */
  timeout?: number;
}

/**
 * `initializing` until the first fetch settles; `ready` after a successful fetch or 304; `stale` when the last
 * fetch failed and an older config is being served; `key_invalid` after a 404 (the key is unknown, revoked or
 * expired: the held config is kept); `offline` after `setOffline()`; `closed` after `close()`.
 */
export type ClientState = "initializing" | "ready" | "stale" | "key_invalid" | "offline" | "closed";

/** Where the config in use came from. */
export type ConfigSource = "fetch" | "cache" | "bootstrap" | "overrides" | "none";

export interface ConfigChangedEvent {
  revision: number;
  generation: number;
  source: ConfigSource;
}

export type FlagsClientErrorCode =
  | "network"
  | "http_status"
  | "too_large"
  | "PARSE_ERROR"
  | "UNSUPPORTED_SCHEMA"
  | "key_invalid"
  | "rate_limited"
  | "cache"
  | "overrides"
  | "evaluation"
  | "listener";

export interface FlagsClientEvents {
  ready: (state: ClientState) => void;
  configChanged: (event: ConfigChangedEvent) => void;
  evaluated: (details: EvaluationDetails<unknown>) => void;
  error: (error: Error & { code?: FlagsClientErrorCode }) => void;
}

/** The value `getValue` returns for a default: booleans, strings and numbers keep their type; objects, arrays and `null` get parsed json. */
export type FlagValue<D> = D extends boolean ? boolean : D extends string ? string : D extends number ? number : D extends null ? unknown : D;

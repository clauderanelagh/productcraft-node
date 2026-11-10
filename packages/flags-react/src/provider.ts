// React bindings for FlagsClient (task 019, design 8.1): one FlagsClient per provider, hooks that
// read a FlagsSnapshot synchronously, and re-renders on config changes via useSyncExternalStore.
// SSR: the server renders from `bootstrap` (a `snapshot().toJSON()`), and hydration reads the same
// bootstrap, so the first client render matches the server HTML. Downloads start after mount.

import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { FlagsClient, type EvaluationDetails, type FlagsClientOptions, type FlagsSnapshot, type FlagValue, type SettingValue, type User } from "@productcraft/flags";

/** A default value: booleans, strings and numbers keep their type; objects, arrays and `null` read json settings. */
export type FlagDefault = SettingValue | object | null;

export interface FlagsProviderProps {
  /** A FlagsClient you built and own (the provider never closes it). Give this or `options`, and keep to that choice for the provider's lifetime. */
  client?: FlagsClient;
  /** Options for a FlagsClient the provider builds on mount and closes on unmount. On the server it never downloads. */
  options?: FlagsClientOptions;
  /** A config JSON, usually `snapshot().toJSON()` from the server: the first render (server and hydration) evaluates it. */
  bootstrap?: string | object | null;
  /** The user hooks evaluate for when a hook passes none. */
  user?: User;
  children?: ReactNode;
}

interface Ctx {
  client: FlagsClient;
  store: Store;
  user: User | undefined;
}

const FlagsContext = createContext<Ctx | null>(null);
const onServer = (): boolean => typeof (globalThis as { window?: unknown }).window === "undefined";

/** The snapshot hooks read, replaced only when the config or the client state really changed. */
class Store {
  #snap: FlagsSnapshot;
  #state: string;
  readonly #listeners = new Set<() => void>();
  /** What the server rendered: the bootstrap when there is one. */
  readonly server: FlagsSnapshot;
  readonly client: FlagsClient;

  constructor(client: FlagsClient, bootstrap: string | object | null | undefined) {
    this.client = client;
    this.#snap = client.snapshot();
    this.#state = client.state;
    this.server = bootstrap == null ? this.#snap : offlineSnapshot(bootstrap);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly get = (): FlagsSnapshot => this.#snap;

  readonly ready = (): boolean => this.client.state !== "initializing";

  /** Listens to the client; returns the function that stops. Picks up anything that changed before it listened. */
  attach(): () => void {
    const update = (): void => {
      const next = this.client.snapshot();
      if (next.toJSON() === this.#snap.toJSON() && this.client.state === this.#state) return;
      this.#snap = next;
      this.#state = this.client.state;
      for (const l of [...this.#listeners]) l();
    };
    const offs = [this.client.on("configChanged", update), this.client.on("ready", update), this.client.on("error", update)];
    update();
    return () => offs.forEach((off) => off());
  }
}

function offlineSnapshot(bootstrap: string | object): FlagsSnapshot {
  const c = new FlagsClient({ bootstrap, offline: true, logger: null });
  c.close();
  return c.snapshot();
}

function build(options: FlagsClientOptions, bootstrap: string | object | null | undefined): FlagsClient {
  return new FlagsClient({ ...options, bootstrap: bootstrap ?? options.bootstrap, ...(onServer() ? { offline: true } : null) });
}

/**
 * Makes a FlagsClient available to the hooks below it.
 * @example
 * ```tsx
 * <FlagsProvider options={{ sdkKey: "pcf_sdk_…" }} user={{ identifier: user.id }}>
 *   <App />
 * </FlagsProvider>
 * ```
 */
export function FlagsProvider(props: FlagsProviderProps): ReactElement {
  const { client: given, options, bootstrap, user, children } = props;
  if (!given && !options) throw new Error("<FlagsProvider> needs a `client` or `options`");
  const [owned, setOwned] = useState<FlagsClient | null>(() => (given ? null : build(options!, bootstrap)));
  useEffect(() => {
    if (given || !owned) return;
    // React StrictMode unmounts and remounts once in development: replace the client that unmount closed.
    if (owned.state === "closed") return void setOwned(build(options!, bootstrap));
    return () => owned.close();
    // `options` and `bootstrap` are read once, like useState's initial value.
  }, [given, owned]);
  const client = given ?? owned!;
  const store = useMemo(() => new Store(client, bootstrap), [client]);
  useEffect(() => store.attach(), [store]);
  const value = useMemo<Ctx>(() => ({ client, store, user }), [client, store, user]);
  return createElement(FlagsContext.Provider, { value }, children);
}

function useFlagsContext(hook: string): Ctx {
  const ctx = useContext(FlagsContext);
  if (!ctx) throw new Error(`${hook}() must be called inside <FlagsProvider>`);
  return ctx;
}

/** A stable dependency for a default or user that callers usually write inline. */
const dep = (v: unknown): unknown => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

/** The value of a flag or setting, evaluated locally; `defaultValue` until a config is there, or on any failure. Re-renders when the config changes. */
export function useFlag<D extends FlagDefault>(key: string, defaultValue: D, user?: User | null): FlagValue<D> {
  return useFlagDetails(key, defaultValue, user).value;
}

/** The value plus why (reason, matched rule or split, error code, revision). */
export function useFlagDetails<D extends FlagDefault>(key: string, defaultValue: D, user?: User | null): EvaluationDetails<FlagValue<D>> {
  const { store, user: fallback } = useFlagsContext("useFlagDetails");
  const snap = useSyncExternalStore(store.subscribe, store.get, () => store.server);
  const u = user ?? fallback;
  return useMemo(() => snap.getValueDetails(key, defaultValue, u), [snap, key, dep(defaultValue), dep(u)]);
}

/** The provider's FlagsClient (for `getAllValues`, `forceRefresh`, events). */
export function useFlagsClient(): FlagsClient {
  return useFlagsContext("useFlagsClient").client;
}

/** False until the client's start-up settled (first download, or `maxInitWaitSeconds`); always false while rendering on the server. */
export function useFlagsReady(): boolean {
  const { store } = useFlagsContext("useFlagsReady");
  return useSyncExternalStore(store.subscribe, store.ready, () => false);
}

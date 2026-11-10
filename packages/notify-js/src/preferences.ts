import type { Notify } from "@productcraft/notify";

type Prefs = Notify.ClientPreferences;
/** One cell of a preferences PATCH (`enabled: null` removes the cell). */
export type PreferenceCellPatch = NonNullable<Notify.MePreferenceUpdateParams["preferences"]>[number];
type CellPatch = PreferenceCellPatch;
/** The channels a preference cell can name (`*` is every channel). */
export type PreferenceChannel = "inbox" | "email" | "push" | "webpush";

/** A preferences snapshot. A new object on every change, so it can back `useSyncExternalStore`. */
export interface PreferencesState {
  /** The recipient's preferences, with the workspace's categories and their defaults; `undefined` until loaded. */
  readonly data: Notify.ClientPreferences | undefined;
  /** `loading` until the first read arrives, `error` when it failed. */
  readonly status: "idle" | "loading" | "ready" | "error";
  /** The last load or save failure. */
  readonly error: unknown;
}

/** What one category × channel cell resolves to (design 6, step 5, without type-level cells). */
export interface ResolvedCell {
  /** Whether the switch is on. */
  readonly enabled: boolean;
  /** The category default is `mandatory` for this channel: always delivered, shown locked. */
  readonly mandatory: boolean;
  /** Where the value came from. */
  readonly source: "category" | "category_all_channels" | "all" | "default";
}

const same = (c: { scope: string; key?: string | null; channel: string }, d: { scope: string; key?: string | null; channel: string }): boolean =>
  c.scope === d.scope && (c.key ?? null) === (d.key ?? null) && c.channel === d.channel;

/**
 * The value a category × channel switch shows: category × channel, then category × `*`, then all ×
 * channel, then the category default (`on`/`mandatory` → on, `off` → off). Mandatory channels are
 * always on, whatever a cell says.
 */
export function resolvePreference(prefs: Notify.ClientPreferences, category: string, channel: PreferenceChannel): ResolvedCell {
  const cat = prefs.categories.find((c) => c.key === category);
  const def = (cat?.defaults as Record<string, string> | undefined)?.[channel] ?? "on";
  if (def === "mandatory") return { enabled: true, mandatory: true, source: "default" };
  const find = (scope: string, key: string | null, ch: string) => prefs.preferences.find((p) => same(p, { scope, key, channel: ch }));
  const hit: [ResolvedCell["source"], Notify.PreferenceCell | undefined][] = [
    ["category", find("category", category, channel)],
    ["category_all_channels", find("category", category, "*")],
    ["all", find("all", null, channel)],
  ];
  for (const [source, cell] of hit) if (cell) return { enabled: cell.enabled, mandatory: false, source };
  return { enabled: def !== "off", mandatory: false, source: "default" };
}

/** Applies a PATCH body to a snapshot, the way the server will (per cell; `enabled: null` removes it). */
const applyPatch = (p: Prefs, cells: readonly CellPatch[], extra: Omit<Notify.MePreferenceUpdateParams, "preferences">): Prefs => {
  let preferences = [...p.preferences];
  for (const c of cells) {
    preferences = preferences.filter((x) => !same(x, c));
    if (c.enabled !== null && c.enabled !== undefined) preferences.push({ scope: c.scope, key: c.key ?? null, channel: c.channel, enabled: c.enabled } as Notify.PreferenceCell);
  }
  const next: Prefs = { ...p, preferences };
  if (extra.timezone !== undefined) next.timezone = extra.timezone;
  if (extra.quiet_hours !== undefined) next.quiet_hours = extra.quiet_hours;
  if (extra.unsubscribed_all !== undefined) next.unsubscribed_all = extra.unsubscribed_all;
  return next;
};

type Call = <T>(fn: (scope: ReturnType<Notify["client"]>) => PromiseLike<T>) => Promise<T>;

/**
 * The recipient's preferences with a cache: `subscribe` (Svelte store contract: the listener runs at
 * once; the first subscriber loads), optimistic per-cell `update` (only the cells you send change, so
 * two open tabs never overwrite each other) reconciled with the server's answer, and a rollback on failure.
 */
export class PreferencesStore {
  #call: Call;
  #state: PreferencesState = { data: undefined, status: "idle", error: undefined };
  #listeners = new Set<(s: PreferencesState) => void>();
  #loading: Promise<Prefs> | undefined;
  #seq = 0;

  /** @internal Built by `createNotifyClient`. */
  constructor(call: Call) {
    this.#call = call;
  }

  /** The current snapshot (backs `useSyncExternalStore`). */
  getState(): PreferencesState {
    return this.#state;
  }

  /** Runs `listener` now and on every change. The first subscriber loads the preferences. */
  subscribe(listener: (state: PreferencesState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    if (this.#listeners.size === 1 && (this.#state.status === "idle" || this.#state.status === "error")) void this.refresh().catch(() => undefined);
    return () => void this.#listeners.delete(listener);
  }

  /** Reads the preferences from the API (one request per call) and updates the cache. */
  get(): Promise<Notify.ClientPreferences> {
    return this.#load();
  }

  /** Fetches the preferences again. Concurrent calls share one request. */
  refresh(): Promise<Notify.ClientPreferences> {
    return (this.#loading ??= this.#load().finally(() => (this.#loading = undefined)));
  }

  #load(): Promise<Prefs> {
    if (this.#state.status !== "ready") this.#set({ status: "loading" });
    const seq = this.#seq;
    return this.#call((s) => s.preferences.retrieve())
      .then(
        (data) => {
          // An update that started meanwhile wins: its answer is newer than this read.
          if (seq === this.#seq) this.#set({ data, status: "ready", error: undefined });
          return data;
        },
        (error) => {
          this.#set({ status: this.#state.data ? "ready" : "error", error });
          throw error;
        },
      );
  }

  /**
   * Sets (or with `enabled: null` removes) only these cells, plus `timezone`, `quiet_hours` or
   * `unsubscribed_all` when given. The cache changes at once and is rolled back if the call fails.
   */
  async update(cells: readonly PreferenceCellPatch[], extra: Omit<Notify.MePreferenceUpdateParams, "preferences"> = {}): Promise<Notify.ClientPreferences> {
    const seq = ++this.#seq;
    const before = this.#state.data;
    if (before) this.#set({ data: applyPatch(before, cells, extra) });
    try {
      const body: Notify.MePreferenceUpdateParams = { ...extra };
      if (cells.length) body.preferences = [...cells];
      const data = await this.#call((s) => s.preferences.update(body));
      // Only the last update in flight writes the server's answer, so a slower earlier answer cannot undo a later switch.
      if (seq === this.#seq) this.#set({ data, status: "ready", error: undefined });
      return data;
    } catch (error) {
      if (seq === this.#seq) this.#set({ data: before, error });
      else this.#set({ error });
      throw error;
    }
  }

  #set(patch: Partial<PreferencesState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const l of this.#listeners) l(this.#state);
  }
}

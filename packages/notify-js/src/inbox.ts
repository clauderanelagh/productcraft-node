import type { Notify } from "@productcraft/notify";
import type { RealtimeStatus } from "./realtime.js";

type Item = Notify.InboxItem;
type Counts = Notify.InboxCounts;
type MarkAction = "seen" | "read" | "unread" | "archived" | "unarchived";

/** Which items a store shows (`GET /v1/client/inbox` query). Counts are always the recipient's totals. */
export interface InboxFilters {
  status?: "all" | "unread" | "unseen";
  category?: string;
  tenant?: string;
  /** `true` lists archived items too. Default `false`. */
  archived?: boolean;
  /** Page size (default 20). */
  limit?: number;
}

/** A store's snapshot. A new object on every change, so it can back `useSyncExternalStore`. */
export interface InboxState {
  readonly items: readonly Item[];
  readonly counts: Counts;
  /** `loading` until the first page arrives, `error` when that failed (see `error`). */
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly hasMore: boolean;
  readonly error: unknown;
  readonly realtime: RealtimeStatus;
}

/** What a store needs from its client. */
export interface InboxHost {
  call<T>(fn: (scope: ReturnType<Notify["client"]>) => PromiseLike<T>): Promise<T>;
  attach(store: InboxStore): void;
  detach(store: InboxStore): void;
  setCounts(counts: Counts): void;
  readonly counts: Counts;
  readonly realtime: RealtimeStatus;
}

const apply = (item: Item, action: string, now: string): Item => {
  switch (action) {
    case "seen":
      return { ...item, seen_at: item.seen_at ?? now };
    case "read":
      return { ...item, read_at: item.read_at ?? now, seen_at: item.seen_at ?? now };
    case "unread":
      return { ...item, read_at: null };
    case "archived":
      return { ...item, archived_at: item.archived_at ?? now };
    case "unarchived":
      return { ...item, archived_at: null };
    case "retracted":
      return { ...item, retracted_at: item.retracted_at ?? now, archived_at: item.archived_at ?? now };
    case "interacted":
      return { ...item, interacted_at: item.interacted_at ?? now, read_at: item.read_at ?? now, seen_at: item.seen_at ?? now };
  }
  return item;
};

const byIdDesc = (a: Item, b: Item): number => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * One inbox view with a cache: the first page, `loadMore()`, real-time updates from the client's shared
 * stream, and optimistic marks reconciled with the counts the server returns. `subscribe` follows the
 * Svelte store contract (the listener runs at once with the current state), so it also backs Vue refs,
 * React's `useSyncExternalStore` (`getState`) and plain callbacks.
 */
export class InboxStore {
  readonly filters: Readonly<InboxFilters>;
  #host: InboxHost;
  #state: InboxState;
  #listeners = new Set<(s: InboxState) => void>();
  #onNew = new Set<(item: Item) => void>();
  #cursor: string | null = null;
  #loading: Promise<void> | undefined;
  #refreshing: Promise<void> | undefined;
  #again = false;

  constructor(host: InboxHost, filters: InboxFilters = {}) {
    this.#host = host;
    this.filters = { ...filters };
    this.#state = { items: [], counts: host.counts, status: "idle", hasMore: false, error: undefined, realtime: host.realtime };
  }

  getState(): InboxState {
    return this.#state;
  }
  get items(): readonly Item[] {
    return this.#state.items;
  }
  get counts(): Counts {
    return this.#state.counts;
  }
  get status(): InboxState["status"] {
    return this.#state.status;
  }

  /** Runs `listener` now and on every change. The first subscriber loads the first page and opens the stream. */
  subscribe(listener: (state: InboxState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    if (this.#listeners.size === 1) {
      this.#host.attach(this);
      if (this.#state.status === "idle" || this.#state.status === "error") void this.refresh().catch(() => undefined);
    }
    return () => {
      if (this.#listeners.delete(listener) && this.#listeners.size === 0) this.#host.detach(this);
    };
  }

  /** Calls `cb` for each new item that matches this store's filters (for toasts). */
  onNew(cb: (item: Item) => void): () => void {
    this.#onNew.add(cb);
    return () => void this.#onNew.delete(cb);
  }

  /** Fetches the first page again and merges it with what is loaded. Concurrent calls share one request. */
  refresh(): Promise<void> {
    if (this.#refreshing) {
      this.#again = true;
      return this.#refreshing;
    }
    if (this.#state.status !== "ready") this.#set({ status: "loading" });
    return (this.#refreshing = this.#page(undefined)
      .then(
        ({ data, next, counts }) => {
          const oldest = data[data.length - 1]?.id;
          const keepOlder = next !== null && oldest !== undefined;
          const older = keepOlder ? this.#state.items.filter((i) => i.id < oldest && !data.some((d) => d.id === i.id)) : [];
          if (!keepOlder || older.length === 0) this.#cursor = next;
          this.#host.setCounts(counts);
          this.#set({ items: [...data, ...older], status: "ready", error: undefined, hasMore: this.#cursor !== null });
        },
        (error) => {
          this.#set({ status: this.#state.status === "ready" ? "ready" : "error", error });
          throw error;
        },
      )
      .finally(() => {
        this.#refreshing = undefined;
        if (this.#again) {
          this.#again = false;
          void this.refresh().catch(() => undefined);
        }
      }));
  }

  /** Appends the next page (no-op when there is none or a load is running). */
  loadMore(): Promise<void> {
    if (this.#cursor === null) return Promise.resolve();
    return (this.#loading ??= this.#page(this.#cursor)
      .then(({ data, next }) => {
        this.#cursor = next;
        this.#set({ items: [...this.#state.items, ...data.filter((d) => !this.#state.items.some((i) => i.id === d.id))], hasMore: next !== null });
      })
      .finally(() => (this.#loading = undefined)));
  }

  markRead(ids: readonly string[]): Promise<void> {
    return this.#mark("read", ids);
  }
  markSeen(ids: readonly string[]): Promise<void> {
    return this.#mark("seen", ids);
  }
  markUnread(ids: readonly string[]): Promise<void> {
    return this.#mark("unread", ids);
  }
  archive(ids: readonly string[]): Promise<void> {
    return this.#mark("archived", ids);
  }
  unarchive(ids: readonly string[]): Promise<void> {
    return this.#mark("unarchived", ids);
  }
  /** Marks every item read: up to the newest loaded item for an unfiltered store, the loaded items otherwise. */
  markAllRead(): Promise<void> {
    return this.#mark("read", undefined);
  }

  /** Records a press on the item (`actionKey` for a button); marks it read. Resolves to the updated item. */
  async interact(id: string, actionKey?: string): Promise<Item> {
    const prev = this.#state.items.find((i) => i.id === id);
    this.#patch([id], "interacted");
    try {
      const item = await this.#host.call((s) => s.inbox.interact(id, actionKey === undefined ? {} : { action_key: actionKey }));
      this.#set({ items: this.#state.items.map((i) => (i.id === id ? { ...item } : i)) });
      return item;
    } catch (e) {
      if (prev) this.#set({ items: this.#state.items.map((i) => (i.id === id ? prev : i)) });
      throw e;
    }
  }

  // ── called by the client ──

  /** @internal */
  _event(name: string, data: { item?: Item; ids?: string[] | null; action?: string | null }): void {
    if (this.#state.status !== "ready") return;
    if (name === "item.created") {
      const item = data.item;
      if (!item) return void this.refresh().catch(() => undefined);
      if (!this.#matches(item) || this.#state.items.some((i) => i.id === item.id)) return;
      this.#set({ items: [item, ...this.#state.items].sort(byIdDesc) });
      for (const cb of this.#onNew) cb(item);
    } else if (name === "item.updated") {
      const { ids, action } = data;
      const known = ["seen", "read", "unread", "archived", "unarchived", "retracted", "interacted"];
      // A bulk change (`ids: null`), an unknown action, or an item coming back from the archive: refetch.
      if (!ids || !action || !known.includes(action) || (action === "unarchived" && ids.some((id) => !this.#state.items.some((i) => i.id === id)))) {
        void this.refresh().catch(() => undefined);
        return;
      }
      this.#patch(ids, action);
    }
  }

  /** @internal */
  _sync(patch: Partial<Pick<InboxState, "counts" | "realtime">>): void {
    this.#set(patch);
  }

  // ── internals ──

  #matches(i: Item): boolean {
    const f = this.filters;
    if (i.retracted_at) return false;
    if (!f.archived && i.archived_at) return false;
    if (f.status === "unread" && i.read_at) return false;
    if (f.status === "unseen" && i.seen_at) return false;
    if (f.category !== undefined && i.category !== f.category) return false;
    return f.tenant === undefined || i.tenant === f.tenant;
  }

  #patch(ids: readonly string[] | undefined, action: string): void {
    const now = new Date().toISOString();
    this.#set({ items: this.#state.items.map((i) => (!ids || ids.includes(i.id) ? apply(i, action, now) : i)).filter((i) => this.#matches(i)) });
  }

  async #mark(action: MarkAction, ids: readonly string[] | undefined): Promise<void> {
    const before = this.#state.items;
    const counts = this.#host.counts;
    const scoped = this.filters.category !== undefined || this.filters.tenant !== undefined;
    const targets = ids ?? before.filter((i) => !i.read_at).map((i) => i.id);
    const chosen = before.filter((i) => targets.includes(i.id));
    // Optimistic counts (archive moves are left to the server's answer).
    const unseen = chosen.filter((i) => !i.seen_at).length;
    const unread = chosen.filter((i) => !i.read_at).length;
    const next =
      action === "read"
        ? ids || scoped
          ? { unseen: counts.unseen - unseen, unread: counts.unread - unread }
          : { unseen: 0, unread: 0 }
        : action === "seen"
          ? { unseen: counts.unseen - unseen, unread: counts.unread }
          : action === "unread"
            ? { unseen: counts.unseen, unread: counts.unread + chosen.filter((i) => i.read_at).length }
            : counts;
    this.#patch(targets, action);
    this.#host.setCounts({ unseen: Math.max(0, next.unseen), unread: Math.max(0, next.unread) });
    try {
      if (!ids && !scoped) {
        const newest = before[0]?.id;
        if (newest) this.#host.setCounts((await this.#host.call((s) => s.inbox.mark({ action, before_id: newest }))).counts);
      } else {
        for (let i = 0; i < targets.length; i += 100) {
          const r = await this.#host.call((s) => s.inbox.mark({ action, ids: targets.slice(i, i + 100) }));
          this.#host.setCounts(r.counts);
        }
      }
    } catch (e) {
      // Put the chosen items back as they were; the counts come back from the server (stream or next refresh).
      const restored = new Map(chosen.map((i) => [i.id, i]));
      const rest = this.#state.items.filter((i) => !restored.has(i.id));
      this.#set({ items: [...rest, ...chosen].sort(byIdDesc) });
      this.#host.setCounts(counts);
      throw e;
    }
  }

  async #page(cursor: string | undefined): Promise<{ data: Item[]; next: string | null; counts: Counts }> {
    const f = this.filters;
    const query: Notify.MeInboxListParams = { limit: f.limit ?? 20, archived: f.archived ?? false };
    if (f.status) query.status = f.status;
    if (f.category !== undefined) query.category = f.category;
    if (f.tenant !== undefined) query.tenant = f.tenant;
    if (cursor) query.cursor = cursor;
    // The page body also carries the counts, which the generated Page drops: read the raw response.
    const body = (await this.#host.call((s) => s.inbox.list(query).asResponse().then((r) => r.json()))) as Notify.ClientInboxList;
    const next = body.pagination?.has_more ? (body.pagination.next_cursor ?? null) : null;
    return { data: body.data, next, counts: body.counts };
  }

  #set(patch: Partial<InboxState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const l of this.#listeners) l(this.#state);
  }
}

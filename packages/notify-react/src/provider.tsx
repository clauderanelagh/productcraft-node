// The provider and hooks (task 020, design 11.3): one notify-js client per provider, stores bound with
// useSyncExternalStore. All state lives in @productcraft/notify-js; nothing here fetches on its own.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { createNotifyClient, type InboxFilters, type InboxState, type InboxStore, type NotifyBrowserClient, type NotifyClientOptions, type PreferenceCellPatch, type PreferencesState } from "@productcraft/notify-js";
import type { NotifyStrings } from "./strings.js";

/** An inbox item as the API returns it. */
export type NotifyInboxItem = InboxState["items"][number];
/** The recipient's preferences with the workspace's categories. */
export type NotifyPreferencesData = NonNullable<PreferencesState["data"]>;
/** `timezone`, `quiet_hours` and `unsubscribed_all` for `usePreferences().update`. */
export type NotifyPreferencesExtra = NonNullable<Parameters<NotifyBrowserClient["preferences"]["update"]>[1]>;

export interface NotifyProviderProps extends Partial<Omit<NotifyClientOptions, "getToken" | "inbox">> {
  /**
   * Returns a recipient token your backend minted (`notify.recipientTokens.mint`), for example
   * `() => fetch("/api/notify-token").then((r) => r.text())`. Read on every call, so an inline function is fine.
   * Give this or `client`.
   */
  getToken?: () => string | Promise<string>;
  /** A client you built with `createNotifyClient` and own (the provider never closes it). */
  client?: NotifyBrowserClient;
  /** Locale of the component strings and relative times (`en`, `pt-PT`, `pt-BR`, `es`, `fr`, `de`; others fall back to English). Default `en`. */
  locale?: string;
  /** Your own wording for any component string. */
  strings?: Partial<NotifyStrings>;
  children?: ReactNode;
}

interface Ctx {
  client: NotifyBrowserClient;
  locale: string;
  strings: Partial<NotifyStrings> | undefined;
  inbox(filters: InboxFilters): InboxStore;
}

const NotifyContext = createContext<Ctx | null>(null);

/**
 * Holds one Notify browser client (one signed-in recipient) for the components and hooks below it.
 * Remount it (say with `key={userId}`) when the signed-in user changes; it closes its client on unmount.
 * @example
 * ```tsx
 * <NotifyProvider getToken={() => fetch("/api/notify-token").then((r) => r.text())} locale="pt-PT">
 *   <NotifyInbox />
 * </NotifyProvider>
 * ```
 */
export function NotifyProvider(props: NotifyProviderProps): ReactElement {
  const { getToken, client: given, locale = "en", strings, children, ...options } = props;
  if (!given && !getToken) throw new Error("<NotifyProvider> needs `getToken` or `client`");
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const build = (): NotifyBrowserClient => createNotifyClient({ ...options, getToken: () => tokenRef.current!() });
  const [owned, setOwned] = useState<{ client: NotifyBrowserClient; closed: boolean } | null>(() => (given ? null : { client: build(), closed: false }));
  useEffect(() => {
    if (given || !owned) return;
    // StrictMode unmounts and remounts once in development: replace the client that unmount closed.
    if (owned.closed) return void setOwned({ client: build(), closed: false });
    return () => {
      owned.closed = true;
      owned.client.close();
    };
    // `options` are read once, like useState's initial value.
  }, [given, owned]);
  const client = given ?? owned!.client;
  const value = useMemo<Ctx>(() => {
    const views = new Map<string, InboxStore>();
    return {
      client,
      locale,
      strings,
      inbox(filters) {
        const key = JSON.stringify([filters.status, filters.category, filters.tenant, filters.archived, filters.limit]);
        if (key === JSON.stringify([undefined, undefined, undefined, undefined, undefined])) return client.inbox;
        let s = views.get(key);
        if (!s) views.set(key, (s = client.createInbox(filters)));
        return s;
      },
    };
  }, [client, locale, strings]);
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

/** @internal The provider's context, for the components. */
export function useNotifyContext(hook: string): Ctx {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error(`${hook} must be used inside <NotifyProvider>`);
  return ctx;
}

/** The provider's notify-js client (devices, `registerWebPush`, `call`). */
export function useNotifyClient(): NotifyBrowserClient {
  return useNotifyContext("useNotifyClient()").client;
}

export interface UseInboxOptions extends InboxFilters {
  /** Runs for each new item matching the filters while mounted (for toasts). */
  onNew?: (item: NotifyInboxItem) => void;
}

export interface UseInboxResult extends InboxState {
  markRead(ids: readonly string[]): Promise<void>;
  markSeen(ids: readonly string[]): Promise<void>;
  markUnread(ids: readonly string[]): Promise<void>;
  markAllRead(): Promise<void>;
  archive(ids: readonly string[]): Promise<void>;
  unarchive(ids: readonly string[]): Promise<void>;
  /** Records a press on the item (`actionKey` for one of its buttons) and marks it read. */
  interact(id: string, actionKey?: string): Promise<NotifyInboxItem>;
  loadMore(): Promise<void>;
  refresh(): Promise<void>;
  /** The underlying notify-js store. */
  store: InboxStore;
}

/**
 * The inbox for these filters: items, `counts` (the recipient's totals), `status`, real-time state and
 * the actions. Loads on mount and stays live; components with the same filters share one store.
 */
export function useInbox(options: UseInboxOptions = {}): UseInboxResult {
  const { onNew, ...filters } = options;
  const ctx = useNotifyContext("useInbox()");
  const store = ctx.inbox(filters);
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const state = useSyncExternalStore(subscribe, () => store.getState(), () => store.getState());
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  useEffect(() => store.onNew((item) => onNewRef.current?.(item)), [store]);
  return useMemo(
    () => ({
      ...state,
      store,
      markRead: (ids) => store.markRead(ids),
      markSeen: (ids) => store.markSeen(ids),
      markUnread: (ids) => store.markUnread(ids),
      markAllRead: () => store.markAllRead(),
      archive: (ids) => store.archive(ids),
      unarchive: (ids) => store.unarchive(ids),
      interact: (id, key) => store.interact(id, key),
      loadMore: () => store.loadMore(),
      refresh: () => store.refresh(),
    }),
    [state, store],
  );
}

export interface UsePreferencesResult extends PreferencesState {
  /** The loaded preferences (alias of `data`). */
  preferences: NotifyPreferencesData | undefined;
  /** Sets (or with `enabled: null` removes) only these cells; optional timezone, quiet hours, unsubscribe-all. */
  update(cells: readonly PreferenceCellPatch[], extra?: NotifyPreferencesExtra): Promise<NotifyPreferencesData>;
  refresh(): Promise<NotifyPreferencesData>;
}

/** The recipient's preferences (loaded on mount) and per-cell `update`, optimistic and rolled back on failure. */
export function usePreferences(): UsePreferencesResult {
  const store = useNotifyContext("usePreferences()").client.preferences;
  const subscribe = useCallback((cb: () => void) => store.subscribe(cb), [store]);
  const state = useSyncExternalStore(subscribe, () => store.getState(), () => store.getState());
  return useMemo(
    () => ({ ...state, preferences: state.data, update: (cells, extra) => store.update(cells, extra), refresh: () => store.refresh() }),
    [state, store],
  );
}

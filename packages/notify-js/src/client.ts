import { Notify } from "@productcraft/notify";
import { InboxStore, type InboxFilters } from "./inbox.js";
import { Realtime, type RealtimeStatus, type VisibilitySource } from "./realtime.js";
import { isTokenError, TokenManager } from "./tokens.js";
import { PreferencesStore } from "./preferences.js";

/** The generated recipient-token scope of `@productcraft/notify` (`notify.client({ token })`). */
export type NotifyClientScope = ReturnType<Notify["client"]>;

export interface NotifyClientOptions {
  /**
   * Returns a recipient token your backend minted (`notify.recipientTokens.mint`). Called at start and
   * whenever the API says the token expired or was revoked; concurrent refreshes share one call. The token
   * is only ever held in memory.
   */
  getToken: () => string | Promise<string>;
  /** Default `https://api.notify.productcraft.co`. */
  baseUrl?: string;
  /** A `fetch` implementation (React Native: one that streams response bodies for real-time). */
  fetch?: typeof fetch;
  /** Filters of `notify.inbox`. */
  inbox?: InboxFilters;
  /** `false` turns the real-time stream off (stores still load and mark). Default `true`. */
  realtime?: boolean;
  /** Pauses the stream while hidden. Default `globalThis.document`; `null` never pauses. */
  document?: VisibilitySource | null;
}

/** The framework-agnostic Notify browser client. One per signed-in recipient; `close()` on sign-out. */
export interface NotifyBrowserClient {
  /** The default inbox store (filters from `options.inbox`). */
  readonly inbox: InboxStore;
  /** Another inbox view (say one per tenant) sharing this client's token and stream. */
  createInbox(filters?: InboxFilters): InboxStore;
  /**
   * The recipient's preferences: `get()`, per-cell `update(cells, extra?)` (only those cells change, so two
   * open tabs never overwrite each other), and a cached, subscribable state for preference screens.
   */
  readonly preferences: PreferencesStore;
  readonly devices: {
    register(params: Notify.MeDeviceRegisterParams): Promise<Notify.Device>;
    /** Call on sign-out so the device stops receiving this recipient's pushes. */
    unregister(deviceId: string): Promise<void>;
  };
  readonly realtime: { readonly status: RealtimeStatus; pause(): void; resume(): void };
  /** Any other client-scope call, with the same token handling (refresh on expiry, retry once). */
  call<T>(fn: (scope: NotifyClientScope) => PromiseLike<T>): Promise<T>;
  /** Stops the stream and drops the token. */
  close(): void;
}

/** The message types `notify-sw.js` posts to open pages. */
export const SW_MESSAGE = { subscriptionChange: "productcraft-notify:subscriptionchange", action: "productcraft-notify:action" } as const;

/**
 * Creates the browser client: a token manager over `getToken`, inbox stores with a cache, one shared
 * real-time stream, preferences and devices. Works in browsers, and in React Native with a fetch that
 * streams response bodies (without one the stream falls back to counts polling).
 */
export function createNotifyClient(options: NotifyClientOptions): NotifyBrowserClient {
  const baseUrl = (options.baseUrl ?? "https://api.notify.productcraft.co").replace(/\/+$/, "");
  const fetchFn = options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const tokens = new TokenManager(options.getToken);
  const api = new Notify({ baseUrl, fetch: fetchFn });
  const scopes = new Map<string, NotifyClientScope>();
  const stores = new Set<InboxStore>();
  const attached = new Set<InboxStore>();
  let counts: Notify.InboxCounts = { unseen: 0, unread: 0 };
  let closed = false;

  const scope = (token: string): NotifyClientScope => {
    let s = scopes.get(token);
    if (!s) {
      scopes.clear();
      scopes.set(token, (s = api.client({ token })));
    }
    return s;
  };

  const call = async <T>(fn: (s: NotifyClientScope) => PromiseLike<T>): Promise<T> => {
    const token = await tokens.get();
    try {
      return await fn(scope(token));
    } catch (e) {
      if (!isTokenError(e)) throw e;
      return fn(scope(await tokens.refresh(token)));
    }
  };

  const setCounts = (c: Notify.InboxCounts): void => {
    if (c.unseen === counts.unseen && c.unread === counts.unread) return;
    counts = { unseen: c.unseen, unread: c.unread };
    for (const s of stores) s._sync({ counts });
  };

  const doc = options.document === null ? undefined : (options.document ?? (globalThis as { document?: VisibilitySource }).document);
  const realtime = new Realtime({
    baseUrl,
    fetch: fetchFn,
    tokens,
    document: doc,
    handlers: {
      event(name, data) {
        const d = (data ?? {}) as { unseen?: number; unread?: number };
        if (name === "counts" && typeof d.unread === "number" && typeof d.unseen === "number") setCounts(d as Notify.InboxCounts);
        else for (const s of attached) s._event(name, d as Parameters<InboxStore["_event"]>[1]);
      },
      polled(c) {
        const grew = c.unread > counts.unread || c.unseen > counts.unseen;
        setCounts(c);
        // Polling carries no items: fetch the first page when something new arrived.
        if (grew) for (const s of attached) void s.refresh().catch(() => undefined);
      },
      status(status) {
        for (const s of stores) s._sync({ realtime: status });
      },
    },
  });

  const host = {
    call,
    setCounts,
    get counts() {
      return counts;
    },
    get realtime() {
      return realtime.status;
    },
    attach(s: InboxStore) {
      attached.add(s);
      if (!closed && options.realtime !== false) realtime.start();
    },
    detach(s: InboxStore) {
      attached.delete(s);
      if (attached.size === 0) realtime.stop();
    },
  };

  const createInbox = (filters?: InboxFilters): InboxStore => {
    const s = new InboxStore(host, filters);
    stores.add(s);
    return s;
  };

  const client: NotifyBrowserClient = {
    inbox: createInbox(options.inbox),
    createInbox,
    preferences: new PreferencesStore(call),
    devices: {
      register: (params) => call((s) => s.devices.register(params)),
      unregister: (id) => call((s) => s.devices.delete(id)).then(() => undefined),
    },
    realtime: {
      get status() {
        return realtime.status;
      },
      pause: () => realtime.pause(),
      resume: () => realtime.resume(),
    },
    call,
    close() {
      closed = true;
      realtime.stop();
      tokens.clear();
      scopes.clear();
      sw?.removeEventListener("message", onSwMessage);
    },
  };

  // Messages from notify-sw.js: a rotated push subscription to re-register, a pressed action button.
  const sw = (globalThis as { navigator?: { serviceWorker?: ServiceWorkerContainer } }).navigator?.serviceWorker;
  const onSwMessage = (e: MessageEvent): void => {
    const m = e.data as { type?: string; subscription?: PushSubscriptionJSON; item_id?: string; action_key?: string | null } | null;
    if (closed || !m) return;
    if (m.type === SW_MESSAGE.subscriptionChange && m.subscription?.endpoint && m.subscription.keys) {
      void client.devices
        .register({ channel: "webpush", app_id: location.origin, subscription: { endpoint: m.subscription.endpoint, keys: m.subscription.keys as { p256dh: string; auth: string } } })
        .catch(() => undefined);
    } else if (m.type === SW_MESSAGE.action && typeof m.item_id === "string") {
      void client.inbox.interact(m.item_id, m.action_key ?? undefined).catch(() => undefined);
    }
  };
  sw?.addEventListener("message", onSwMessage);

  return client;
}

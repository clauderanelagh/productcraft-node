// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotifyClient, NotifyClientError, type NotifyBrowserClient } from "../src/index.js";
import { apiError, fakeApi, flush, inboxPage, item, json, until } from "./helpers.js";

const BASE = "https://api.notify.test";
let client: NotifyBrowserClient | undefined;
afterEach(() => {
  client?.close();
  client = undefined;
  vi.restoreAllMocks();
});

function setup(opts: { tokens?: string[]; inbox?: Parameters<typeof createNotifyClient>[0]["inbox"]; realtime?: boolean } = {}) {
  const api = fakeApi();
  const tokens = [...(opts.tokens ?? ["rt_1", "rt_2", "rt_3"])];
  const getToken = vi.fn(async () => tokens.shift() ?? "rt_last");
  client = createNotifyClient({ getToken, baseUrl: BASE, fetch: api.fetch, inbox: opts.inbox, realtime: opts.realtime, document: null });
  return { api, getToken, client };
}

describe("token manager", () => {
  it("fetches one token for concurrent calls and refreshes once on RECIPIENT_TOKEN_EXPIRED", async () => {
    const { api, getToken, client } = setup();
    let n = 0;
    api.on("GET /v1/client/preferences", (c) =>
      c.headers.authorization === "Bearer rt_1" ? (n++, apiError(401, "RECIPIENT_TOKEN_EXPIRED")) : json({ categories: [], preferences: [], unsubscribed_all: false, timezone: null, quiet_hours: null }),
    );
    const [a, b, c] = await Promise.all([client.preferences.get(), client.preferences.get(), client.preferences.get()]);
    expect(a.unsubscribed_all).toBe(false);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(n).toBe(3);
    // One token at start, one shared refresh for the three expired calls.
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(api.calls.filter((x) => x.headers.authorization === "Bearer rt_2")).toHaveLength(3);
  });

  it("retries a call once only, and passes other errors through", async () => {
    const { api, getToken, client } = setup();
    api.on("GET /v1/client/preferences", () => apiError(401, "RECIPIENT_TOKEN_EXPIRED"));
    await expect(client.preferences.get()).rejects.toMatchObject({ status: 401, code: "RECIPIENT_TOKEN_EXPIRED" });
    expect(getToken).toHaveBeenCalledTimes(2);
    api.on("DELETE /v1/client/devices/d1", () => apiError(404, "DEVICE_NOT_FOUND"));
    await expect(client.devices.unregister("d1")).rejects.toMatchObject({ status: 404 });
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("refuses an API key or an empty token from getToken", async () => {
    for (const bad of ["pcft_live_abc", "  "]) {
      const api = fakeApi();
      const c = createNotifyClient({ getToken: () => bad, baseUrl: BASE, fetch: api.fetch, document: null });
      const err = await c.preferences.get().catch((e) => e);
      expect(err).toBeInstanceOf(NotifyClientError);
      expect(err.code).toBe("TOKEN_INVALID");
      expect(api.calls).toHaveLength(0);
      c.close();
    }
  });

  it("never writes a token to Web Storage or puts it in a URL", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    const get = vi.spyOn(Storage.prototype, "getItem");
    const { api, client } = setup();
    api.on("GET /v1/client/inbox", () => inboxPage([item()]));
    api.on("POST /v1/client/inbox/mark", () => json({ updated: 1, counts: { unseen: 0, unread: 0 } }));
    const stop = client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready" && api.streams.length === 1);
    await client.inbox.markAllRead();
    stop();
    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    for (const c of api.calls) {
      expect(c.url).not.toContain("rt_");
      expect(c.headers.authorization).toMatch(/^Bearer rt_/);
    }
  });

  it("devices.unregister calls DELETE /client/devices/{id}; preferences.update sends only the cells", async () => {
    const { api, client } = setup();
    api.on("DELETE /v1/client/devices/dev_1", () => new Response(null, { status: 204 }));
    api.on("PATCH /v1/client/preferences", (c) => json({ categories: [], preferences: (c.body as { preferences: unknown[] }).preferences, unsubscribed_all: false, timezone: "Europe/Lisbon", quiet_hours: null }));
    await expect(client.devices.unregister("dev_1")).resolves.toBeUndefined();
    const prefs = await client.preferences.update([{ scope: "category", key: "billing", channel: "email", enabled: false }], { timezone: "Europe/Lisbon" });
    expect(prefs.preferences).toHaveLength(1);
    expect(api.calls.at(-1)?.body).toEqual({ timezone: "Europe/Lisbon", preferences: [{ scope: "category", key: "billing", channel: "email", enabled: false }] });
  });
});

describe("inbox store", () => {
  it("loads the first page and counts, then applies item.created, counts and onNew from the stream", async () => {
    const { api, client } = setup();
    const first = item();
    api.on("GET /v1/client/inbox", () => inboxPage([first], { unseen: 1, unread: 1 }));
    const states: unknown[] = [];
    const stop = client.inbox.subscribe((s) => states.push(s));
    expect(states[0]).toMatchObject({ status: "idle", items: [] }); // runs at once (Svelte store contract)
    await until(() => client.inbox.status === "ready" && api.streams.length === 1);
    expect(client.inbox.items.map((i) => i.id)).toEqual([first.id]);
    expect(client.inbox.counts).toEqual({ unseen: 1, unread: 1 });
    expect(api.calls.find((c) => c.path === "/v1/client/inbox")?.url).toContain("archived=false");

    const toasts: string[] = [];
    client.inbox.onNew((i) => toasts.push(i.title));
    const fresh = item({ title: "Second" });
    api.lastStream.send("item.created", { item: fresh }, fresh.id);
    api.lastStream.send("counts", { unseen: 2, unread: 2 });
    await until(() => client!.inbox.counts.unread === 2);
    expect(client.inbox.items.map((i) => i.id)).toEqual([fresh.id, first.id]);
    expect(toasts).toEqual(["Second"]);
    // The same event again (a catch-up replay) is ignored.
    api.lastStream.send("item.created", { item: fresh }, fresh.id);
    await flush();
    expect(client.inbox.items).toHaveLength(2);
    expect(toasts).toHaveLength(1);
    stop();
    expect(client.realtime.status).toBe("idle");
  });

  it("filters by category and tenant, for the list query and for streamed items", async () => {
    const { api, client } = setup();
    api.on("GET /v1/client/inbox", () => inboxPage([]));
    const store = client.createInbox({ category: "billing", tenant: "org_42" });
    const seen: string[] = [];
    store.onNew((i) => seen.push(i.id));
    store.subscribe(() => undefined);
    await until(() => store.status === "ready" && api.streams.length === 1);
    expect(api.calls.find((c) => c.path === "/v1/client/inbox")?.url).toMatch(/category=billing/);
    expect(api.calls.find((c) => c.path === "/v1/client/inbox")?.url).toMatch(/tenant=org_42/);
    const other = item({ category: "comments", tenant: "org_42" });
    const mine = item({ category: "billing", tenant: "org_42" });
    const wrongTenant = item({ category: "billing", tenant: "org_7" });
    for (const i of [other, mine, wrongTenant]) api.lastStream.send("item.created", { item: i }, i.id);
    await until(() => store.items.length === 1);
    await flush();
    expect(store.items.map((i) => i.id)).toEqual([mine.id]);
    expect(seen).toEqual([mine.id]);
  });

  it("applies item.updated, drops retracted items, and refetches on a bulk change", async () => {
    const { api, client } = setup();
    const a = item();
    const b = item();
    let pages = 0;
    api.on("GET /v1/client/inbox", () => (pages++, inboxPage([b, a])));
    client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready" && api.streams.length === 1);
    api.lastStream.send("item.updated", { ids: [a.id], action: "read" });
    await until(() => client!.inbox.items.find((i) => i.id === a.id)?.read_at != null);
    expect(client.inbox.items.find((i) => i.id === a.id)?.seen_at).not.toBeNull();
    api.lastStream.send("item.updated", { ids: [b.id], action: "retracted" });
    await until(() => client!.inbox.items.length === 1);
    expect(client.inbox.items[0]?.id).toBe(a.id);
    api.lastStream.send("item.updated", { ids: null, action: "read" });
    await until(() => pages === 2);
  });

  it("marks optimistically and reconciles with the counts the server returns", async () => {
    const { api, client } = setup();
    const a = item();
    const b = item();
    api.on("GET /v1/client/inbox", () => inboxPage([b, a], { unseen: 5, unread: 5 }));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    api.on("POST /v1/client/inbox/mark", async () => (await gate, json({ updated: 1, counts: { unseen: 3, unread: 4 } })));
    client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready");
    const p = client.inbox.markRead([a.id]);
    // Optimistic: the item is read and both counts drop before the server answers.
    expect(client.inbox.items.find((i) => i.id === a.id)?.read_at).not.toBeNull();
    expect(client.inbox.counts).toEqual({ unseen: 4, unread: 4 });
    release();
    await p;
    expect(client.inbox.counts).toEqual({ unseen: 3, unread: 4 });
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ action: "read", ids: [a.id] });
  });

  it("puts items and counts back when a mark fails", async () => {
    const { api, client } = setup();
    const a = item();
    api.on("GET /v1/client/inbox", () => inboxPage([a], { unseen: 1, unread: 1 }));
    api.on("POST /v1/client/inbox/mark", () => apiError(400, "VALIDATION_ERROR"));
    client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready");
    await expect(client.inbox.archive([a.id])).rejects.toMatchObject({ status: 400 });
    expect(client.inbox.items.map((i) => i.id)).toEqual([a.id]);
    expect(client.inbox.items[0]?.archived_at).toBeNull();
    expect(client.inbox.counts).toEqual({ unseen: 1, unread: 1 });
  });

  it("markAllRead uses before_id on an unfiltered store and the loaded ids on a filtered one", async () => {
    const { api, client } = setup();
    const a = item({ category: "billing" });
    const b = item({ category: "billing" });
    api.on("GET /v1/client/inbox", () => inboxPage([b, a], { unseen: 9, unread: 9 }));
    api.on("POST /v1/client/inbox/mark", () => json({ updated: 2, counts: { unseen: 7, unread: 7 } }));
    client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready");
    const p = client.inbox.markAllRead();
    expect(client.inbox.counts).toEqual({ unseen: 0, unread: 0 });
    await p;
    expect(api.calls.filter((c) => c.method === "POST").at(-1)?.body).toEqual({ action: "read", before_id: b.id });
    const billing = client.createInbox({ category: "billing" });
    billing.subscribe(() => undefined);
    await until(() => billing.status === "ready");
    await billing.markAllRead();
    expect(api.calls.filter((c) => c.method === "POST").at(-1)?.body).toEqual({ action: "read", ids: [b.id, a.id] });
  });

  it("loadMore appends the next page with the cursor; interact records the press", async () => {
    const { api, client } = setup();
    const [a, b, c] = [item(), item(), item()];
    api.on("GET /v1/client/inbox", (call) => (call.url.includes("cursor=") ? inboxPage([a]) : inboxPage([c, b], undefined, "cur_2")));
    api.on("POST /v1/client/inbox/" + c.id + "/interact", (call) => json({ ...c, read_at: "2026-11-10T00:00:00Z", interacted_at: "2026-11-10T00:00:00Z", interaction_key: (call.body as { action_key?: string }).action_key }));
    client.inbox.subscribe(() => undefined);
    await until(() => client.inbox.status === "ready");
    expect(client.inbox.getState().hasMore).toBe(true);
    await client.inbox.loadMore();
    expect(client.inbox.items.map((i) => i.id)).toEqual([c.id, b.id, a.id]);
    expect(client.inbox.getState().hasMore).toBe(false);
    expect(api.calls.at(-1)?.url).toContain("cursor=cur_2");
    const updated = await client.inbox.interact(c.id, "accept");
    expect(updated.interaction_key).toBe("accept");
    expect(client.inbox.items[0]?.interaction_key).toBe("accept");
  });
});

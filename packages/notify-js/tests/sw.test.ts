// notify-sw.js against a fake service-worker global: show, click, subscription change.
import { describe, expect, it, vi } from "vitest";
import { NOTIFY_SW_SOURCE } from "../src/sw.js";

type Listener = (e: Record<string, unknown>) => void;

function worker(windows: { url: string; focus?: () => unknown }[] = []) {
  const listeners = new Map<string, Listener>();
  const posted: unknown[][] = windows.map(() => []);
  const clientList = windows.map((w, i) => ({ ...w, postMessage: (m: unknown) => posted[i]!.push(m) }));
  const newSub = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: { p256dh: "p", auth: "a" } }) };
  const self = {
    location: { origin: "https://app.example.com" },
    addEventListener: (t: string, cb: Listener) => listeners.set(t, cb),
    registration: { showNotification: vi.fn(async () => undefined), pushManager: { subscribe: vi.fn(async () => newSub) } },
    clients: { matchAll: vi.fn(async () => clientList), openWindow: vi.fn(async () => undefined) },
  };
  new Function("self", NOTIFY_SW_SOURCE)(self);
  const dispatch = async (type: string, e: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...e, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { self, dispatch, posted, listeners };
}

const pushEvent = (payload: unknown) => ({ data: { json: () => payload, text: () => JSON.stringify(payload) } });

describe("notify-sw.js", () => {
  it("registers push, notificationclick and pushsubscriptionchange", () => {
    expect([...worker().listeners.keys()].sort()).toEqual(["notificationclick", "push", "pushsubscriptionchange"]);
  });

  it("shows the notification from the payload, with up to 2 actions", async () => {
    const w = worker();
    const payload = { title: "Invoice paid", body: "€42", icon: "https://cdn.example.com/i.png", tag: "inv", notification_id: "n1", delivery_id: "d1", url: "/billing" };
    await w.dispatch("push", pushEvent(payload));
    expect(w.self.registration.showNotification).toHaveBeenCalledWith("Invoice paid", { body: "€42", icon: payload.icon, tag: "inv", data: payload });
    await w.dispatch("push", pushEvent({ title: "Invite", body: "b", actions: [{ action_key: "accept", label: "Accept" }, { action_key: "no", label: "Decline" }, { action_key: "x", label: "X" }] }));
    const opts = (w.self.registration.showNotification.mock.calls[1] as unknown[])[1] as { actions: unknown[] };
    expect(opts.actions).toEqual([{ action: "accept", title: "Accept" }, { action: "no", title: "Decline" }]);
  });

  it("contract with notify-api's web push payload: item_id and buttons with an action_key or a url", async () => {
    // The exact shape notify-api sends (apps/notify-api webPushPayload: inbox item_id plus its buttons).
    const payload = {
      title: "Ana invited you",
      body: "Join Acme",
      url: "https://app.example.com/invites/1",
      notification_id: "n1",
      delivery_id: "d1",
      item_id: "i1",
      actions: [
        { label: "Accept", action_key: "accept" },
        { label: "View", url: "https://app.example.com/invites/1/details" },
      ],
    };
    const w = worker([{ url: "https://app.example.com/" }]);
    await w.dispatch("push", pushEvent(payload));
    const opts = (w.self.registration.showNotification.mock.calls[0] as unknown[])[1] as { actions: unknown[] };
    expect(opts.actions).toEqual([{ action: "accept", title: "Accept" }, { action: "open:1", title: "View" }]);

    // The key button: interact with its action_key, open the payload url.
    await w.dispatch("notificationclick", { action: "accept", notification: { close() {}, data: payload } });
    expect(w.posted[0]).toEqual([{ type: "productcraft-notify:action", item_id: "i1", action_key: "accept", notification_id: "n1" }]);
    expect(w.self.clients.openWindow).toHaveBeenLastCalledWith("https://app.example.com/invites/1");

    // The link button: a press on the item (no action_key), opens the button's url.
    await w.dispatch("notificationclick", { action: "open:1", notification: { close() {}, data: payload } });
    expect(w.posted[0]![1]).toEqual({ type: "productcraft-notify:action", item_id: "i1", action_key: null, notification_id: "n1" });
    expect(w.self.clients.openWindow).toHaveBeenLastCalledWith("https://app.example.com/invites/1/details");

    // The body: a press on the item.
    await w.dispatch("notificationclick", { action: "", notification: { close() {}, data: payload } });
    expect(w.posted[0]![2]).toEqual({ type: "productcraft-notify:action", item_id: "i1", action_key: null, notification_id: "n1" });
  });

  it("shows plain text when the payload is not JSON", async () => {
    const w = worker();
    await w.dispatch("push", { data: { json: () => { throw new Error("x"); }, text: () => "hello" } });
    expect(w.self.registration.showNotification).toHaveBeenCalledWith("hello", { body: "", data: { title: "hello" } });
  });

  it("on click, asks one page to record the press and opens the url", async () => {
    const w = worker([{ url: "https://app.example.com/inbox" }, { url: "https://app.example.com/other" }]);
    const close = vi.fn();
    await w.dispatch("notificationclick", { action: "accept", notification: { close, data: { item_id: "i1", notification_id: "n1", url: "/inbox/i1", actions: [{ action_key: "accept", label: "Accept", url: "https://app.example.com/accept" }] } } });
    expect(close).toHaveBeenCalled();
    expect(w.posted[0]).toEqual([{ type: "productcraft-notify:action", item_id: "i1", action_key: "accept", notification_id: "n1" }]);
    expect(w.posted[1]).toEqual([]);
    expect(w.self.clients.openWindow).toHaveBeenCalledWith("https://app.example.com/accept");
  });

  it("focuses a tab already on the url, and never opens a javascript: or http: cross-origin url", async () => {
    const focus = vi.fn();
    const w = worker([{ url: "https://app.example.com/inbox", focus }]);
    await w.dispatch("notificationclick", { action: "", notification: { close() {}, data: { url: "/inbox" } } });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(w.self.clients.openWindow).not.toHaveBeenCalled();
    expect(w.posted[0]).toEqual([]);
    for (const url of ["javascript:alert(1)", "http://evil.example.com/x"]) {
      const v = worker([]);
      await v.dispatch("notificationclick", { action: "", notification: { close() {}, data: { url } } });
      expect(v.self.clients.openWindow).not.toHaveBeenCalled();
    }
  });

  it("re-subscribes on pushsubscriptionchange with the old key and tells every open page", async () => {
    const w = worker([{ url: "https://app.example.com/" }, { url: "https://app.example.com/b" }]);
    const key = new Uint8Array([1, 2, 3]).buffer;
    await w.dispatch("pushsubscriptionchange", { oldSubscription: { options: { applicationServerKey: key } } });
    expect(w.self.registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
    const msg = { type: "productcraft-notify:subscriptionchange", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: { p256dh: "p", auth: "a" } } };
    expect(w.posted).toEqual([[msg], [msg]]);
  });
});

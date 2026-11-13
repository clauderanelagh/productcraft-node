// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNotifyClient, NotifyClientError, registerWebPush, SW_MESSAGE } from "../src/index.js";
import { fakeApi, json } from "./helpers.js";

const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const keyBytes = (k: string) => Uint8Array.from(atob(k.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (k.length % 4)) % 4)), (c) => c.charCodeAt(0));

afterEach(() => vi.unstubAllGlobals());

function browser(opts: { permission?: NotificationPermission; gesture?: boolean; existingKey?: string; supported?: boolean } = {}) {
  const sub = (key: string) => ({
    options: { applicationServerKey: keyBytes(key).buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${key.slice(0, 6)}`, keys: { p256dh: "pk", auth: "au" } }),
  });
  const existing = opts.existingKey ? sub(opts.existingKey) : null;
  const pushManager = { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => sub(KEY)) };
  const swListeners: ((e: MessageEvent) => void)[] = [];
  const serviceWorker = { register: vi.fn(async () => ({ pushManager })), addEventListener: (_: string, cb: (e: MessageEvent) => void) => swListeners.push(cb), removeEventListener: vi.fn() };
  const Notification = { permission: opts.permission ?? "default", requestPermission: vi.fn(async () => "granted") };
  if (opts.supported !== false) {
    vi.stubGlobal("navigator", { ...navigator, serviceWorker, userActivation: { isActive: opts.gesture ?? true } });
    vi.stubGlobal("PushManager", function PushManager() {});
    vi.stubGlobal("Notification", Notification);
  }
  const api = fakeApi();
  api.on("GET /v1/client/webpush/vapid-public-key", () => json({ public_key: KEY }));
  api.on("POST /v1/client/devices", (c) => json({ id: "dev_1", channel: "webpush", app_id: (c.body as { app_id: string }).app_id, platform: "web", state: "active" }, 201));
  api.on("POST /v1/client/inbox/i1/interact", () => json({ id: "i1" }));
  const client = createNotifyClient({ getToken: () => "rt_1", baseUrl: "https://api.notify.test", fetch: api.fetch, document: null });
  return { api, client, pushManager, serviceWorker, Notification, existing, swListeners };
}

describe("registerWebPush", () => {
  it("asks permission, subscribes with the VAPID key and registers a webpush device", async () => {
    const b = browser();
    const { device } = await registerWebPush(b.client, { serviceWorkerPath: "/notify-sw.js" });
    expect(device.id).toBe("dev_1");
    expect(b.Notification.requestPermission).toHaveBeenCalledTimes(1);
    // Permission first, before any network call, while the gesture is active.
    expect(b.Notification.requestPermission.mock.invocationCallOrder[0]).toBeLessThan(b.serviceWorker.register.mock.invocationCallOrder[0]!);
    expect(b.serviceWorker.register).toHaveBeenCalledWith("/notify-sw.js", undefined);
    const subscribeArg = (b.pushManager.subscribe.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array; userVisibleOnly: boolean }])[0];
    expect(subscribeArg.userVisibleOnly).toBe(true);
    expect([...subscribeArg.applicationServerKey]).toEqual([...keyBytes(KEY)]);
    const reg = b.api.calls.find((c) => c.path === "/v1/client/devices");
    expect(reg?.body).toMatchObject({ channel: "webpush", platform: "web", app_id: location.origin, subscription: { endpoint: expect.stringMatching(/^https:\/\/fcm/), keys: { p256dh: "pk", auth: "au" } } });
    b.client.close();
  });

  it("keeps a subscription made with the same key and replaces one made with another key", async () => {
    const same = browser({ permission: "granted", existingKey: KEY });
    await registerWebPush(same.client, { serviceWorkerPath: "/notify-sw.js" });
    expect(same.pushManager.subscribe).not.toHaveBeenCalled();
    expect(same.Notification.requestPermission).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    const other = browser({ permission: "granted", existingKey: "BOtherKeyBOtherKeyBOtherKeyBOtherKeyBOtherKeyBOtherKeyBOtherKeyBOtherKeyBOtherKeyBO" });
    await registerWebPush(other.client, { serviceWorkerPath: "/notify-sw.js" });
    expect(other.existing?.unsubscribe).toHaveBeenCalled();
    expect(other.pushManager.subscribe).toHaveBeenCalled();
  });

  it("throws typed errors: no gesture, permission denied, unsupported", async () => {
    const noGesture = browser({ gesture: false });
    const e1 = await registerWebPush(noGesture.client, { serviceWorkerPath: "/sw.js" }).catch((e) => e);
    expect(e1).toBeInstanceOf(NotifyClientError);
    expect(e1.code).toBe("USER_GESTURE_REQUIRED");
    expect(noGesture.Notification.requestPermission).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    const denied = browser({ permission: "denied" });
    await expect(registerWebPush(denied.client, { serviceWorkerPath: "/sw.js" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(denied.api.calls).toHaveLength(0);
    vi.unstubAllGlobals();
    const none = browser({ supported: false });
    await expect(registerWebPush(none.client, { serviceWorkerPath: "/sw.js" })).rejects.toMatchObject({ code: "WEBPUSH_UNSUPPORTED" });
  });

  it("waits for a first-visit worker to activate before subscribing", async () => {
    const b = browser();
    let state = "installing";
    const listeners: (() => void)[] = [];
    const worker = { get state() { return state; }, addEventListener: (_: string, cb: () => void) => listeners.push(cb), removeEventListener: vi.fn() };
    const subscribe = b.pushManager.subscribe;
    b.pushManager.subscribe = vi.fn(async (...args: Parameters<typeof subscribe>) => {
      if (state !== "activated") throw new DOMException("Subscription failed - no active Service Worker", "AbortError");
      return subscribe(...args);
    });
    b.serviceWorker.register.mockImplementationOnce(async () => ({ pushManager: b.pushManager, installing: worker }) as never);
    const pending = registerWebPush(b.client, { serviceWorkerPath: "/notify-sw.js" });
    await new Promise((r) => setTimeout(r, 0));
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
    state = "activated";
    for (const cb of listeners) cb();
    const { device } = await pending;
    expect(device.id).toBe("dev_1");
  });

  it("re-registers on the worker's subscription change and records action presses", async () => {
    const b = browser({ permission: "granted" });
    expect(b.swListeners).toHaveLength(1);
    const send = (data: unknown) => b.swListeners[0]!({ data } as MessageEvent);
    send({ type: SW_MESSAGE.subscriptionChange, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: { p256dh: "p2", auth: "a2" } } });
    send({ type: SW_MESSAGE.action, item_id: "i1", action_key: "accept" });
    send({ type: "something-else" });
    await vi.waitFor(() => expect(b.api.calls).toHaveLength(2));
    expect(b.api.calls.find((c) => c.path === "/v1/client/devices")?.body).toMatchObject({ channel: "webpush", subscription: { keys: { p256dh: "p2" } } });
    expect(b.api.calls.find((c) => c.path.endsWith("/interact"))?.body).toEqual({ action_key: "accept" });
    b.client.close();
    expect(b.serviceWorker.removeEventListener).toHaveBeenCalled();
  });
});

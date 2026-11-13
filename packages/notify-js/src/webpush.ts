import type { Notify } from "@productcraft/notify";
import type { NotifyBrowserClient } from "./client.js";
import { NotifyClientError } from "./errors.js";

export interface RegisterWebPushOptions {
  /** Where your app serves `notify-sw.js` (or your own worker that includes `NOTIFY_SW_SOURCE`), e.g. `/notify-sw.js`. */
  serviceWorkerPath: string;
  /** The worker's scope (default: the browser's default for the path). */
  scope?: string;
}

export interface WebPushRegistration {
  device: Notify.Device;
  subscription: PushSubscription;
}

const toBytes = (b64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array<ArrayBuffer>): boolean => {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

/**
 * Asks for notification permission, subscribes this browser with the workspace's VAPID key and registers it
 * as a `webpush` device. Call it from a click handler the first time (browsers only show the permission prompt
 * during a user gesture; this throws `USER_GESTURE_REQUIRED` where that can be detected). Once permission is
 * granted it is safe to call on every page load: the registration is an upsert, and a subscription made with
 * an older key (after a VAPID rotation) is replaced.
 */
export async function registerWebPush(client: NotifyBrowserClient, options: RegisterWebPushOptions): Promise<WebPushRegistration> {
  const g = globalThis as unknown as { navigator?: Navigator; Notification?: typeof Notification; PushManager?: unknown };
  const nav = g.navigator;
  if (!nav?.serviceWorker || !g.PushManager || !g.Notification) {
    throw new NotifyClientError("WEBPUSH_UNSUPPORTED", "This browser does not support web push (needs a service worker, PushManager and Notification; Safari on iOS only in an installed web app).");
  }
  let permission = g.Notification.permission;
  if (permission === "default") {
    const activation = (nav as { userActivation?: { isActive: boolean } }).userActivation;
    if (activation && !activation.isActive) {
      throw new NotifyClientError("USER_GESTURE_REQUIRED", "registerWebPush() must be called from a user gesture (a click handler) the first time: browsers only show the permission prompt then.");
    }
    // First, before any other await, so the gesture is still active.
    permission = await g.Notification.requestPermission();
  }
  if (permission !== "granted") throw new NotifyClientError("PERMISSION_DENIED", "Notification permission was not granted.");

  const reg = await nav.serviceWorker.register(options.serviceWorkerPath, options.scope ? { scope: options.scope } : undefined);
  // On a first visit the worker is still installing; Chrome refuses
  // pushManager.subscribe() until it is active ("no active Service Worker").
  await untilActive(reg);
  const { public_key } = await client.call((s) => s.webpush.vapidPublicKey());
  const key = toBytes(public_key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // no Intl time zone data
  }
  const device = await client.devices.register({
    channel: "webpush",
    platform: "web",
    app_id: location.origin,
    subscription: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
    ...(timezone ? { timezone } : {}),
  });
  return { device, subscription: sub };
}

/** Resolves once this registration's worker is active (or can never be). */
function untilActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return Promise.resolve();
  const worker = reg.installing ?? reg.waiting;
  if (!worker) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", done);
        resolve();
      }
    };
    worker.addEventListener("statechange", done);
    done();
  });
}

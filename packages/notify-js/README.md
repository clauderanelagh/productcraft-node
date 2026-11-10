# @productcraft/notify-js

The framework-agnostic browser (and React Native) client for [ProductCraft Notify](https://productcraft.co/docs/notify): an in-app inbox with a cache and real-time updates, unread counts, mark read / seen / archived, action buttons, per-recipient preferences, device unregister on sign-out, and web push with a ready-made service worker.

It is the shared core under `@productcraft/notify-react`; Vue, Svelte, Angular and vanilla JS use it directly. Every call goes through the recipient-token scope of [`@productcraft/notify`](../notify#readme).

```sh
npm install @productcraft/notify-js
```

Notify is in preview. Web push works with keys Notify generates for you; push to iOS and Android apps still needs your own APNs key and Firebase credentials, uploaded in the console.

## How it fits together

Your backend signs the user in, then mints a short-lived **recipient token** with your API key (`notify.recipientTokens.mint`, from `@productcraft/notify`) and hands it to the page. The page never sees your API key. `getToken` is how this package asks for one: at start, and again whenever the API says the token expired or was revoked (concurrent requests share one call). The token is kept in memory only: never in `localStorage`, `sessionStorage`, a cookie or a URL.

```ts
import { createNotifyClient } from "@productcraft/notify-js";

const notify = createNotifyClient({
  getToken: () => fetch("/api/notify-token", { method: "POST" }).then((r) => r.text()),
});
```

The matching backend route, with `@productcraft/notify`:

```ts
import { Notify } from "@productcraft/notify";

const notify = new Notify(); // PRODUCTCRAFT_API_KEY + PRODUCTCRAFT_WORKSPACE_ID
export async function notifyToken(userId: string): Promise<string> {
  const { token } = await notify.recipientTokens.mint({ recipient: userId, ttl_seconds: 3600 });
  return token;
}
```

## The inbox

`notify.inbox` is a store: `subscribe` runs your listener at once and on every change, and returns the unsubscribe function (the Svelte store contract, so `$inbox` works in Svelte as is). The first subscriber loads the first page and opens the real-time stream; when the last one leaves, the stream closes.

```ts
import { createNotifyClient } from "@productcraft/notify-js";

const notify = createNotifyClient({ getToken: () => fetch("/api/notify-token").then((r) => r.text()) });
const render = (..._args: unknown[]) => undefined;
const toast = (_text: string) => undefined;

const stop = notify.inbox.subscribe(({ items, counts, status, hasMore, realtime }) => {
  render(items, counts.unread, status, hasMore, realtime);
});
notify.inbox.onNew((item) => toast(item.title)); // a new item arrived in real time

const first = notify.inbox.items[0];
if (first) {
  await notify.inbox.markRead([first.id]);
  await notify.inbox.interact(first.id, "accept"); // a press on an action button (or omit the key for the item)
}
await notify.inbox.markAllRead();
await notify.inbox.archive(notify.inbox.items.slice(0, 2).map((i) => i.id));
await notify.inbox.loadMore();
stop();
```

- **State:** `items` (newest first, retracted items left out), `counts` (`unread` and `unseen` for the whole inbox, for the badge), `status` (`idle`, `loading`, `ready`, `error`), `hasMore`, `error`, and `realtime` (below). `getState()` returns the same snapshot object until something changes, so it can back React's `useSyncExternalStore`.
- **Optimistic marks:** `markRead`, `markSeen`, `markUnread`, `archive`, `unarchive` and `markAllRead` update the items and counts at once, then take the counts the server returns. If the call fails the items and counts go back and the promise rejects. `markAllRead` covers everything up to the newest loaded item (one request), or only the loaded items on a filtered store.
- **Filters:** `createNotifyClient({ inbox: { category, tenant, status, archived, limit } })` filters `notify.inbox`; `notify.createInbox({ tenant: "org_42" })` makes more views that share the token and the stream.

## Real-time

One stream per client (`GET /v1/client/inbox/stream`, Server-Sent Events read with `fetch`, so the token travels in the `Authorization` header). The `realtime` status is `connecting`, `open`, `polling`, `paused` or `idle`.

- Reconnects after 1 s, doubling to 30 s, plus up to 1 s of random jitter, and never sooner than the server's `retry` or `Retry-After`. It sends `Last-Event-ID` so items created while it was away are replayed.
- On `auth_expired` (the token expired or was revoked) it calls `getToken` and reconnects at once.
- After 3 failed connections in a row it also polls `GET /v1/client/inbox/counts` every 30 s (with `If-None-Match`, so an unchanged count costs a `304`), refetches the first page when the count grows, and stops polling once the stream is back.
- It closes while the tab is hidden and reconnects (with catch-up) when it is visible again.

**React Native.** There is no `document`, so nothing pauses on its own: call `notify.realtime.pause()` and `notify.realtime.resume()` from an `AppState` listener. React Native's built-in `fetch` cannot stream a response body; pass a streaming `fetch` (for example from `react-native-fetch-api` with `reactNative: { textStreaming: true }`, or `expo/fetch`) as `createNotifyClient({ fetch })`. Without one the stream fails and the client polls counts every 30 s instead.

## Preferences and devices

```ts
import { createNotifyClient } from "@productcraft/notify-js";

const notify = createNotifyClient({ getToken: () => fetch("/api/notify-token").then((r) => r.text()) });

const prefs = await notify.preferences.get(); // categories with defaults, the recipient's own cells, time zone, quiet hours
console.log(prefs.categories.length);
// Only these cells change, so two open tabs never overwrite each other.
await notify.preferences.update([{ scope: "category", key: "billing", channel: "email", enabled: false }], {
  timezone: "Europe/Lisbon",
  quiet_hours: { start: "22:00", end: "07:00" },
});

// On sign-out: stop this device receiving pushes, then drop the client.
await notify.devices.unregister("3f0c3c1e-8a2b-4c55-9d3f-0a1b2c3d4e5f");
notify.close();
```

`notify.call((scope) => scope.inbox.counts())` runs any other client-scope call with the same token handling.

## Web push

1. Turn web push on for the workspace (the console, or `notify.channels.webpush.generateVapidKeys()` from your backend) and add your site to the workspace's client origins.
2. Serve the service worker from your site root: copy `node_modules/@productcraft/notify-js/dist/notify-sw.js` to `public/notify-sw.js` (it is also exported as `@productcraft/notify-js/notify-sw.js`). To add it to a worker you already have, append the string `NOTIFY_SW_SOURCE` from `@productcraft/notify-js/sw`.
3. Call `registerWebPush` from a click handler:

```ts
import { createNotifyClient, NotifyClientError, registerWebPush } from "@productcraft/notify-js";

const notify = createNotifyClient({ getToken: () => fetch("/api/notify-token").then((r) => r.text()) });

document.querySelector("#enable-push")?.addEventListener("click", async () => {
  try {
    const { device } = await registerWebPush(notify, { serviceWorkerPath: "/notify-sw.js" });
    console.log("push on", device.id);
  } catch (e) {
    if (e instanceof NotifyClientError) console.warn(e.code); // WEBPUSH_UNSUPPORTED, PERMISSION_DENIED, USER_GESTURE_REQUIRED
    else throw e;
  }
});
```

Browsers only show the permission prompt during a user gesture, so the first call must come from a click (it throws `USER_GESTURE_REQUIRED` where the browser can tell). Once permission is granted, call it on every page load: it registers the same device again (an upsert) and replaces a subscription made with an older key after a key rotation.

The service worker shows each push (`title`, `body`, `icon`, `tag`), focuses or opens its `url` on click (same-origin or https only), and on `pushsubscriptionchange` subscribes again and asks the open page to register the new subscription (the page holds the token; the worker never does). When a payload carries an inbox `item_id` it asks the page to record the press with `interact`, and it shows up to two action buttons when the payload has `actions`; today's web push payloads carry neither.

## Size

About 5 KB gzip for this package's own code; with the `@productcraft/notify` client scope it uses, about 17.5 KB gzip in a browser bundle. `"sideEffects": false`.

## License

MIT

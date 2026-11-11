# @productcraft/notify

Node.js / TypeScript client for **ProductCraft Notify**: one call notifies a user across an in-app inbox, email (sent through ProductCraft Mail), web push, APNs and FCM, with per-user preferences per category and channel, fallbacks, quiet hours, templates per channel and locale, delivery history and signed webhooks.

Notify does not replace your own push credentials: Apple and Google tie push to your developer accounts, so you upload your APNs key and Firebase service account once (stored encrypted, never returned). Notify takes care of what comes after: device tokens, pruning dead ones, per-platform payloads, retries, fallbacks and delivery feedback.

Every method, type, error class and mock is generated from the production OpenAPI spec. Notify is in preview.

## Install

```sh
npm install @productcraft/notify
```

Node 20.3 or later, Bun, Deno, edge runtimes and browsers (the `client({ token })` scope). Or install the umbrella package for every product: `npm install productcraft`.

## Quick start (your server)

```ts
import { Notify } from "@productcraft/notify";

// Reads PRODUCTCRAFT_API_KEY (and PRODUCTCRAFT_WORKSPACE_ID) from the environment.
const notify = new Notify({ workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });

// Tell Notify who the user is (your own user id is the key).
await notify.recipients.identify("user_123", { email: "ada@example.com", locale: "en" });

// Notify them: the notification type decides the channels, templates and fallback order.
const sent = await notify.notifications.send({
  type: "comment_created",
  recipients: ["user_123"],
  data: { author: "Grace", post_title: "Hello" },
});
// The result is `Notify.NotificationSendResponse`: the accepted notification, or the plan when
// you pass `dry_run: true` (nothing is stored or sent).
if ("id" in sent) console.log(sent.id, sent.status);
```

`notifications.send` always carries an `Idempotency-Key` (the SDK generates one per call and reuses it on retries; pass `{ idempotencyKey }` to tie it to your own event id).

## In the browser or an app: `notify.client({ token })`

Never ship an API key to a browser or an app. Your backend mints a short-lived **recipient token** for the signed-in user, and the client side calls Notify with only that token:

```ts
import { Notify } from "@productcraft/notify";

// Server: an endpoint that returns a token for the signed-in user.
const server = new Notify({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });
const { token } = await server.recipientTokens.mint({ recipient: "user_123" });

// Browser or app: no API key, just the token.
const me = new Notify().client({ token });
const page = await me.inbox.list({ status: "unread" });
const ids = page.data.map((item) => item.id);
if (ids.length) await me.inbox.mark({ ids, action: "read" });
```

`client({ token })` sends `Authorization: Bearer <token>` and nothing else: no API key, no environment fallback. It refuses a `pcft_` key. Tokens expire (one hour by default); fetch a new one when a call fails with `RECIPIENT_TOKEN_EXPIRED`. For a stateful inbox with real-time updates, web push and preferences, use [`@productcraft/notify-js`](https://www.npmjs.com/package/@productcraft/notify-js) (browser and React Native) or [`@productcraft/notify-react`](https://www.npmjs.com/package/@productcraft/notify-react) (ready-made inbox and preference components); both are built on this package.

## Credentials

Pass `apiKey` (a workspace key, `pcft_live_…`), or omit it and the client reads `PRODUCTCRAFT_API_KEY`. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code (a workspace key in a browser throws unless you set `dangerouslyAllowBrowser: true`).

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `notify.categories`: `create`, `delete`, `list`, `retrieve`, `update`
- `notify.channels`: `apns.deleteCredential`, `apns.uploadCredential`, `fcm.deleteCredential`, `fcm.uploadCredential`, `list`, `webpush.generateVapidKeys`, `webpush.importVapidKeys`, `webpush.retrieve`
- `notify.client(…).devices`: `delete`, `register`
- `notify.client(…).inbox`: `counts`, `interact`, `list`, `mark`
- `notify.client(…).preferences`: `retrieve`, `update`
- `notify.client(…).webpush`: `vapidPublicKey`
- `notify.deliveries`: `list`, `retrieve`
- `notify.export`: `retrieve`
- `notify.notificationTypes`: `archive`, `create`, `list`, `preview`, `replaceByKey`, `retrieve`, `templates.delete`, `templates.retrieve`, `templates.revert`, `templates.update`, `templates.versions`, `update`
- `notify.notifications`: `cancel`, `cancelByKey`, `list`, `retract`, `retrieve`, `send`
- `notify.recipientTokens`: `mint`
- `notify.recipients`: `bulkIdentify`, `delete`, `devices.create`, `devices.delete`, `devices.list`, `identify`, `inbox.list`, `list`, `preferences.replace`, `preferences.retrieve`, `preferences.update`, `retrieve`, `revokeTokens`, `timeline`, `update`
- `notify.settings`: `retrieve`, `revokeAllTokens`, `update`
- `notify.setupStatus`: `retrieve`
- `notify.stats`: `retrieve`
- `notify.webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of notify.recipients.list({ limit: 50 })) console.log(item);
const page = await notify.recipients.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await notify.recipients.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Notify, NotFoundError, RateLimitError, APIError } from "@productcraft/notify";
const notify = new Notify();
try {
  await notify.categories.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

## Retries and timeouts

Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` are retried twice by default with exponential backoff and jitter, honouring `Retry-After` up to 60 s. A POST or PATCH without an idempotency key is never retried. Each attempt times out after 60 s, so the worst case with defaults is about 3 minutes; pass `signal: AbortSignal.timeout(ms)` for an overall deadline.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ maxRetries: 3, timeout: 20_000 });
await notify.recipients.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const result = await notify.notifications.send({
  recipients: ["user_123", { email: "a@example.com", external_id: "user_456", locale: "pt-PT" }],
  type: "invoice.paid",
}, { idempotencyKey: "order-1234" });
```

## Webhooks

`notify.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Notify.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_NOTIFY_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify();
export async function POST(req: Request) {
  const event = await notify.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "credential.invalid":
      console.log(event.data);
      break;
    default:
      break; // UnknownWebhookEvent: types added later
  }
  return new Response(null, { status: 204 });
}
```

Express (keep the body raw):

```ts
import express from "express";
import { Notify } from "@productcraft/notify";
const notify = new Notify();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await notify.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Notify } from "@productcraft/notify";
const notify = new Notify();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await notify.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await notify.webhooks.sign({ payload: { id: "evt_test_1", type: "credential.invalid", created_at: new Date().toISOString(), data: {} } });
const event = await notify.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await notify.categories.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await notify.categories.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/notify/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name. It also exports `signWebhook({ payload, secret })`, which signs a test event for your webhook handler (the same as `webhooks.sign()`, without a client).

```ts
import { Notify } from "@productcraft/notify";
import { createMockFetch } from "@productcraft/notify/testing";
const fetch = createMockFetch();
const notify = new Notify({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await notify.recipients.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Notify } from "@productcraft/notify";
const notify = new Notify({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await notify.client.GET("/v1/workspaces/{workspace_id}/categories", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

## License

MIT

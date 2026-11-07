# @productcraft/mail

Node.js / TypeScript client for **ProductCraft Mail**: transactional email (raw HTML or templates), sending domains with DKIM, the per-recipient delivery log, contacts, segments, broadcasts, suppression lists and signed webhooks.

Every method, type, error class and mock is generated from the production OpenAPI spec. Upgrading from 0.x? See the [1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/mail-1.0.0.md).

## Install

```sh
npm install @productcraft/mail
```

Node 20.3 or later, Bun, Deno and edge runtimes. Or install the umbrella package for every product: `npm install productcraft`.

## Quick start

```ts
import { Mail } from "@productcraft/mail";

// Reads PRODUCTCRAFT_API_KEY (and PRODUCTCRAFT_WORKSPACE_ID) from the environment.
const mail = new Mail({ workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });

// Send raw HTML (an Idempotency-Key is generated for you, so a retry never sends twice).
const email = await mail.emails.send({
  from: "Acme <hello@mail.acme.com>",
  to: "success@simulator.amazonses.com",
  subject: "Welcome",
  html: "<p>Thanks for signing up.</p>",
});
console.log(email.id);

// Or render a stored template with your data.
await mail.templates.send("welcome", { to: "success@simulator.amazonses.com", data: { first_name: "Ada" } });

// Walk the delivery log; pages are fetched as you iterate.
for await (const message of mail.messages.list({ status: ["bounced", "complained"] })) {
  console.log(message.id, message.status);
}
```

`workspaceId` is optional for workspace API keys: without it the client looks it up once per process (one extra request on a cold start). Pass it, or set `PRODUCTCRAFT_WORKSPACE_ID`, to skip the lookup. Bearer tokens must always pass it.

Nouns: `emails` is the call you made (send, batch, list, retrieve, metrics); `messages` is the per-recipient delivery log of what you sent (list, retrieve, body, export, erase); `received` is the mail your domains received, with its daily `timeline`. Exports, raw MIME and attachments resolve to the raw `Response` (`.text()`, `.arrayBuffer()`, `.body`).

## Credentials

Pass `apiKey` (a workspace key, `pcft_live_…`), or omit it and the client reads `PRODUCTCRAFT_API_KEY`. An explicit `auth: { type: "bearer", token }` works for platform user tokens. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code (a workspace key in a browser throws unless you set `dangerouslyAllowBrowser: true`).

Webhook signing secrets: Mail has a workspace default secret, per-domain secrets and one per endpoint. Pass all that apply as an array (`new Mail({ webhookSecret: [a, b] })` or `mail.webhooks.unwrap({ ..., secret: [a, b] })`); `unwrap` accepts the Standard Webhooks headers and the older `X-Mail-Signature` scheme.

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `mail.brand`: `reset`, `retrieve`, `update`
- `mail.broadcasts`: `audience`, `cancel`, `clickedLinks.list`, `create`, `delete`, `duplicate`, `list`, `recipients.list`, `retrieve`, `send`, `settings.retrieve`, `settings.update`, `update`
- `mail.contacts`: `create`, `delete`, `imports.create`, `imports.list`, `imports.retrieve`, `list`, `properties.create`, `properties.delete`, `properties.list`, `properties.retrieve`, `properties.update`, `retrieve`, `segments.add`, `segments.delete`, `segments.list`, `topics.list`, `topics.update`, `update`
- `mail.deliverability`: `retrieve`
- `mail.domains`: `create`, `delete`, `dnsRecords.apply`, `dnsRecords.check`, `dnsRecords.export`, `dnsRecords.list`, `domainConnect.start`, `events.list`, `list`, `lookup`, `retrieve`, `shareLinks.create`, `shareLinks.delete`, `shareLinks.list`, `smtpConfig.reset`, `smtpConfig.retrieve`, `smtpConfig.update`, `smtpConfig.verifySaved`, `testSend`, `update`, `verify`
- `mail.emails`: `batch`, `list`, `metrics`, `retrieve`, `send`
- `mail.integrations`: `delete`, `github.connect`, `github.repos.branches.list`, `github.repos.list`, `github.settings.update`, `github.sync.create`, `github.sync.retrieve`, `list`, `retrieve`
- `mail.mailboxes`: `create`, `delete`, `list`, `messages.attachments.retrieve`, `messages.delete`, `messages.list`, `messages.raw`, `messages.read`, `messages.retrieve`, `retrieve`, `update`
- `mail.messages`: `body`, `erase`, `export`, `list`, `retrieve`, `settings.retrieve`, `settings.update`
- `mail.received`: `attachments.retrieve`, `delete`, `export`, `list`, `raw`, `read`, `retrieve`, `timeline`
- `mail.segments`: `contacts.list`, `create`, `delete`, `list`, `metrics`, `preview`, `retrieve`, `update`
- `mail.sendingDefaults`: `retrieve`, `update`
- `mail.smtpConfig`: `list`, `reset`, `retrieve`, `update`, `verify`, `verifySaved`
- `mail.stats`: `retrieve`
- `mail.suppression`: `create`, `delete`, `list`
- `mail.templates`: `create`, `delete`, `lint`, `list`, `preview`, `render`, `retrieve`, `send`, `sendBatch`, `tags.list`, `testSend`, `variables.list`
- `mail.topics`: `create`, `delete`, `list`, `retrieve`, `update`
- `mail.webhooks`: `attempts.list`, `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of mail.broadcasts.list({ limit: 50 })) console.log(item);
const page = await mail.broadcasts.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await mail.broadcasts.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Mail, NotFoundError, RateLimitError, APIError } from "@productcraft/mail";
const mail = new Mail();
try {
  await mail.broadcasts.retrieve("00000000-0000-0000-0000-000000000000");
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
import { Mail } from "@productcraft/mail";
const mail = new Mail({ maxRetries: 3, timeout: 20_000 });
await mail.broadcasts.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const broadcast = await mail.broadcasts.create({ name: "October product update" }, { idempotencyKey: "order-1234" });
```

## Polling

`domains.poll(id)` retrieves until `status` is terminal (`active`, `disabled`), honouring `Retry-After`; `timeoutMs` (default 5 min) throws `APITimeoutError`.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const done = await mail.domains.poll("9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", { intervalMs: 2_000, timeoutMs: 600_000 });
console.log(done.status);
```

## Webhooks

`mail.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Mail.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_MAIL_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail();
export async function POST(req: Request) {
  const event = await mail.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "contact.created":
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
import { Mail } from "@productcraft/mail";
const mail = new Mail();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await mail.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Mail } from "@productcraft/mail";
const mail = new Mail();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await mail.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await mail.webhooks.sign({ payload: { id: "evt_test_1", type: "contact.created", created_at: new Date().toISOString(), data: {} } });
const event = await mail.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await mail.broadcasts.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await mail.broadcasts.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/mail/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name.

```ts
import { Mail } from "@productcraft/mail";
import { createMockFetch } from "@productcraft/mail/testing";
const fetch = createMockFetch();
const mail = new Mail({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await mail.broadcasts.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await mail.client.GET("/v1/workspaces/{workspace_id}/brand", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

## License

MIT

# @productcraft/waitlist

Node.js / TypeScript client for **ProductCraft Waitlist**: waitlists with public signup forms, A/B and locale variants, referrals with position and leaderboard, an approval workflow with invite-to-app, CSV export, analytics and signed webhooks.

Every method, type, error class and mock is generated from the production OpenAPI spec. Upgrading from 1.x? See the [2.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-2.0.0.md) (from 0.x: [1.0](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-1.0.0.md)).

## Install

```sh
npm install @productcraft/waitlist
```

Node 20.3 or later, Bun, Deno, edge runtimes and browsers (the public signup routes). Or install the umbrella package for every product: `npm install productcraft`.

## Quick start: a public signup form (no key, browser-safe)

```ts
import { Waitlist } from "@productcraft/waitlist";

// No API key: the public routes are anonymous and safe to call from a browser bundle.
const form = new Waitlist().public({ workspace: "acme", waitlist: "early-access" });

const info = await form.info.retrieve(); // display name, status, custom fields, active variant
const entry = await form.entries.create({
  email: "ada@example.com",
  name: "Ada Lovelace",
  referral_code: "ADA123", // optional: credits the person who shared their link
});
console.log(info.display_name, entry.position, entry.referral_code);

const { data: top } = await form.leaderboard.list();
```

`entries.create` carries an `Idempotency-Key`, so a retried submit never signs the same person up twice. If the waitlist has a reCAPTCHA site key (`info.recaptcha_site_key`), pass the `recaptcha_token` your page obtained.

## Quick start: manage waitlists (server, workspace key)

```ts
import { Waitlist } from "@productcraft/waitlist";

// Reads PRODUCTCRAFT_API_KEY (and PRODUCTCRAFT_WORKSPACE_ID) from the environment.
const waitlist = new Waitlist({ workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });

const list = await waitlist.lists.create({ display_name: "Beta", slug: "beta", status: "active" });

// Pages are fetched as you iterate.
for await (const entry of waitlist.lists.entries.list(list.id, { status: "pending" })) {
  console.log(entry.email, entry.position);
}

const { count } = await waitlist.lists.entries.count(list.id);
await waitlist.lists.entries.bulk(list.id, { ids: ["3f0c1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b"], action: "approve" });
await waitlist.lists.updateStatus(list.id, { status: "closed" });

const csv = await waitlist.lists.entries.export(list.id); // a raw Response
console.log(count, await csv.text());
```

`waitlist.lists` is the waitlists themselves (the root namespace is named `lists` so it does not read `waitlist.waitlists`). `workspaceId` is optional for workspace API keys: without it the client looks it up once per process. Bearer tokens must always pass it.

## Credentials

Pass `apiKey` (a workspace key, `pcft_live_…`), or omit it and the client reads `PRODUCTCRAFT_API_KEY`. An explicit `auth: { type: "bearer", token }` works for platform user tokens. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code. A keyed client constructed in a browser throws unless you set `dangerouslyAllowBrowser: true`; the keyless `new Waitlist()` never does, and `public(…)` calls never send a credential even on a keyed client.

Webhook signing secrets: pass the endpoint's secret (or several, during a rotation) as `new Waitlist({ webhookSecret })` or `waitlist.webhooks.unwrap({ ..., secret })`; `unwrap` accepts the Standard Webhooks headers and the older `X-Waitlist-Signature` scheme.

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `waitlist.lists`: `analytics.retrieve`, `analytics.timeline`, `create`, `delete`, `entries.bulk`, `entries.count`, `entries.delete`, `entries.export`, `entries.inviteToApp`, `entries.list`, `entries.retrieve`, `entries.update`, `list`, `retrieve`, `testEntries.create`, `update`, `updateStatus`, `variants.create`, `variants.delete`, `variants.list`, `variants.update`
- `waitlist.public(…).entries`: `create`
- `waitlist.public(…).info`: `retrieve`
- `waitlist.public(…).leaderboard`: `list`
- `waitlist.settings`: `notifications.test`, `retrieve`, `update`
- `waitlist.stats`: `retrieve`
- `waitlist.webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of waitlist.lists.list({ limit: 50 })) console.log(item);
const page = await waitlist.lists.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await waitlist.lists.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Waitlist, NotFoundError, RateLimitError, APIError } from "@productcraft/waitlist";
const waitlist = new Waitlist();
try {
  await waitlist.lists.retrieve("00000000-0000-0000-0000-000000000000");
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
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ maxRetries: 3, timeout: 20_000 });
await waitlist.lists.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const list = await waitlist.lists.create({ display_name: "Early Access Program", slug: "early-access" }, { idempotencyKey: "order-1234" });
```

## Webhooks

`waitlist.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Waitlist.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_WAITLIST_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist();
export async function POST(req: Request) {
  const event = await waitlist.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "entry.approved":
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
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await waitlist.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await waitlist.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await waitlist.webhooks.sign({ payload: { id: "evt_test_1", type: "entry.approved", created_at: new Date().toISOString(), data: {} } });
const event = await waitlist.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await waitlist.lists.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await waitlist.lists.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/waitlist/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name. It also exports `signWebhook({ payload, secret })`, which signs a test event for your webhook handler (the same as `webhooks.sign()`, without a client).

```ts
import { Waitlist } from "@productcraft/waitlist";
import { createMockFetch } from "@productcraft/waitlist/testing";
const fetch = createMockFetch();
const waitlist = new Waitlist({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await waitlist.lists.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Waitlist } from "@productcraft/waitlist";
const waitlist = new Waitlist({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await waitlist.client.GET("/v1/workspaces/{workspace_id}/stats", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

## License

MIT

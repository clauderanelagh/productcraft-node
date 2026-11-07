# @productcraft/trawl

Node.js / TypeScript client for **ProductCraft Trawl**, AI web extraction. Give Trawl a JSON Schema and a description of what you want (plus optional seed URLs); a browser agent reads the live web and returns data in the shape of your schema.

Every method, type, error class and mock is generated from the production OpenAPI spec. Upgrading from 0.x? See the [1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/trawl-1.0.0.md).

## Install

```sh
npm install @productcraft/trawl
```

Node 20.3 or later, Bun, Deno and edge runtimes. Or install the umbrella package for every product: `npm install productcraft`.

## Quick start

```ts
import { Trawl } from "@productcraft/trawl";

// Reads PRODUCTCRAFT_API_KEY (and PRODUCTCRAFT_WORKSPACE_ID) from the environment.
const trawl = new Trawl({ workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });

type Tiers = { tiers: { name: string; price: string }[] };
const job = await trawl.jobs.createAndPoll<Tiers>({
  description: "The name and monthly price of each pricing tier",
  json_schema: {
    type: "object",
    properties: {
      tiers: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, price: { type: "string" } }, required: ["name", "price"] },
      },
    },
    required: ["tiers"],
  },
  suggested_urls: ["https://example.com/pricing"],
});

if (job.status === "succeeded") console.log(job.result?.tiers[0]?.name);
else console.log(job.status, job.error);
```

`workspaceId` is optional for workspace API keys: without it the client looks it up once per process (one extra request on a cold start). Pass it, or set `PRODUCTCRAFT_WORKSPACE_ID`, to skip the lookup. Bearer tokens must always pass it.

Job creation is rate-limited per workspace and each agent step uses one credit; a workspace with no credits gets `402`.

## Credentials

Pass `apiKey` (a workspace key, `pcft_live_…`), or omit it and the client reads `PRODUCTCRAFT_API_KEY`. An explicit `auth: { type: "bearer", token }` works for platform user tokens. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code (a workspace key in a browser throws unless you set `dangerouslyAllowBrowser: true`).

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `trawl.credits`: `retrieve`
- `trawl.jobs`: `cancel`, `create`, `list`, `retrieve`
- `trawl.stats`: `retrieve`
- `trawl.webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of trawl.jobs.list({ limit: 50 })) console.log(item);
const page = await trawl.jobs.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await trawl.jobs.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Trawl, NotFoundError, RateLimitError, APIError } from "@productcraft/trawl";
const trawl = new Trawl();
try {
  await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000");
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
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ maxRetries: 3, timeout: 20_000 });
await trawl.jobs.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const job = await trawl.jobs.create({
  description: "Extract the product title and price from each page.",
  json_schema: { properties: { title: { type: "string" } }, required: ["title"], type: "object" },
}, { idempotencyKey: "order-1234" });
```

## Polling

`jobs.poll(id)` retrieves until `status` is terminal (`succeeded`, `failed`, `cancelled`), honouring `Retry-After`; `timeoutMs` (default 5 min) throws `APITimeoutError`.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const done = await trawl.jobs.poll("9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", { intervalMs: 2_000, timeoutMs: 600_000 });
console.log(done.status);
```

`jobs.createAndPoll<T>(params)` creates, then polls; `result` is typed as `T` (a type assertion: the SDK does not validate it at runtime).

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
type Extracted = { title: string };
const done = await trawl.jobs.createAndPoll<Extracted>({
  description: "Extract the product title and price from each page.",
  json_schema: { properties: { title: { type: "string" } }, required: ["title"], type: "object" },
}, { timeoutMs: 600_000 });
console.log(done.result?.title);
```

## Webhooks

`trawl.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Trawl.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_TRAWL_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl();
export async function POST(req: Request) {
  const event = await trawl.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "credits.low":
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
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await trawl.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await trawl.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await trawl.webhooks.sign({ payload: { id: "evt_test_1", type: "credits.low", created_at: new Date().toISOString(), data: {} } });
const event = await trawl.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await trawl.jobs.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await trawl.jobs.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/trawl/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name.

```ts
import { Trawl } from "@productcraft/trawl";
import { createMockFetch } from "@productcraft/trawl/testing";
const fetch = createMockFetch();
const trawl = new Trawl({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await trawl.jobs.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await trawl.client.GET("/v1/workspaces/{workspace_id}/credits", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

## License

MIT

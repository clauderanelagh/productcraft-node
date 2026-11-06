# Migrating to @productcraft/trawl 1.0

`@productcraft/trawl` 1.0 is generated from the Trawl OpenAPI spec onto the shared runtime in `@productcraft/core`: resource methods (`trawl.jobs.create()`), auto-pagination, polling, retries with automatic idempotency keys, typed error classes and webhook verification.

**Nothing you call today breaks.** `trawl.client` (the typed `openapi-fetch` client) is still there with the same `paths` types, so every 0.x call site keeps compiling and running. Move call sites over at your own pace; this guide shows the 1.0 shape for every call our docs and consumers make.

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { Trawl, NotFoundError, APIError } from "@productcraft/trawl"; const trawl = new Trawl(); const json_schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] }; -->

## Constructing the client

```ts before
const trawl = new Trawl({ auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! } });
const workspace_id = process.env.WORKSPACE_ID!; // passed on every call
```

```ts
const client = new Trawl({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: process.env.WORKSPACE_ID });
```

- `apiKey` is shorthand for `auth: { type: "apiKey", key }`; `auth` still works (bearer and cookie credentials too). Both fall back to `PRODUCTCRAFT_API_KEY`.
- `workspaceId` is bound once on the client (or `PRODUCTCRAFT_WORKSPACE_ID`). With a workspace API key you can leave it out: the client looks it up once per process. Override it per call with `{ workspaceId }` in the request options.
- New options: `maxRetries` (default 2), `timeout` (default 60 s per attempt), `fetch`, `defaultHeaders`, `logLevel`, `logger`, `webhookSecret`.

## Create a job

```ts before
const { data: job, error } = await trawl.client.POST("/v1/workspaces/{workspace_id}/jobs", {
  params: { path: { workspace_id } },
  body: { description: "Extract the title.", json_schema, max_steps: 20 },
});
if (error) throw error;
```

```ts
const job = await trawl.jobs.create({ description: "Extract the title.", json_schema, max_steps: 20 });
```

The method resolves to the job and throws on failure. An `Idempotency-Key` is sent automatically and reused on every retry, so a retried create never queues a second job; pass `{ idempotencyKey: "…" }` as the last argument to choose your own.

## Wait for a job

```ts before
const TERMINAL = ["succeeded", "failed", "cancelled"];
async function waitForJob(workspaceId: string, jobId: string) {
  for (;;) {
    const { data } = await trawl.client.GET("/v1/workspaces/{workspace_id}/jobs/{id}", {
      params: { path: { workspace_id: workspaceId, id: jobId } },
    });
    if (data && TERMINAL.includes(data.status)) return data;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
const finished = await waitForJob(workspace_id, job.id);
```

```ts
type Product = { title: string };
const job = await trawl.jobs.create({ description: "Extract the title.", json_schema });
const finished = await trawl.jobs.poll<Product>(job.id, { intervalMs: 5_000, timeoutMs: 600_000 });
console.log(finished.status, finished.result?.title);

// Or create and wait in one call:
const done = await trawl.jobs.createAndPoll<Product>({ description: "Extract the title.", json_schema });
```

`poll` honours `Retry-After` and throws `APITimeoutError` after `timeoutMs` (default 5 minutes). The type argument types `result`; it is a type assertion, not validated at runtime.

## Retrieve, cancel and list jobs

```ts before
const { data: one } = await trawl.client.GET("/v1/workspaces/{workspace_id}/jobs/{id}", { params: { path: { workspace_id, id } } });
await trawl.client.POST("/v1/workspaces/{workspace_id}/jobs/{id}/cancel", { params: { path: { workspace_id, id } } });
const { data: page } = await trawl.client.GET("/v1/workspaces/{workspace_id}/jobs", {
  params: { path: { workspace_id }, query: { limit: 20 } },
});
```

```ts
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const one = await trawl.jobs.retrieve(id);
await trawl.jobs.cancel(id);

const page = await trawl.jobs.list({ limit: 20 });            // one page: page.data, page.has_more
for await (const job of trawl.jobs.list({ limit: 20 })) {      // every job, across pages
  console.log(job.id, job.status);
}
console.log(one.status, page.data.length);
```

## Errors

```ts before
const { data, error } = await trawl.client.GET("/v1/workspaces/{workspace_id}/jobs/{id}", { params: { path: { workspace_id, id } } });
if (error) console.error(error);
```

```ts
try {
  await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

Every class (`BadRequestError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `APIConnectionError`, `APITimeoutError`, …) is exported from `@productcraft/trawl`.

## Webhooks

The legacy `/webhooks` routes (one secret per webhook, jobs that name it) are deprecated and are not SDK methods; reach them through `trawl.client` until you move. Endpoints under `/webhooks/endpoints` receive every event they subscribe to:

```ts before
await trawl.client.POST("/v1/workspaces/{workspace_id}/webhooks", {
  params: { path: { workspace_id } },
  body: { url: "https://example.com/trawl-hook" },
});
```

```ts
const endpoint = await trawl.webhooks.endpoints.create({ url: "https://example.com/trawl-hook", event_types: ["job.succeeded", "job.failed"] });
console.log(endpoint.signing_secret); // shown once: store it as PRODUCTCRAFT_TRAWL_WEBHOOK_SECRET
```

Verify deliveries against the raw body:

```ts
export async function POST(req: Request) {
  const event = await trawl.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  if (event.type === "job.succeeded") console.log(event.data);
  return new Response(null, { status: 204 });
}
```

## The umbrella package

`productcraft` exposes the same client as `pc.trawl`, so everything above applies to `pc.trawl.jobs.create(…)` as well.

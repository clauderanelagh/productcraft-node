# @productcraft/trawl

## 1.0.4

### Patch Changes

- Updated dependencies [ac1db59]
- Updated dependencies [9facfd6]
- Updated dependencies [6aa992e]
  - @productcraft/core@1.0.0

## 1.0.3

### Patch Changes

- ca7418e: Refresh trawl OpenAPI types from production.

## 1.0.2

### Patch Changes

- 6d892f1: `@productcraft/trawl/testing`: `createMockFetch()` returns real enum values for `status` fields (1.0.1 sent the string spread into an object, e.g. `{ "0": "q", … }`, or `null` in list items), and a polled `jobs.retrieve` answers with a terminal status, so `jobs.poll()` and `jobs.createAndPoll()` finish against the default mock instead of timing out.

## 1.0.1

### Patch Changes

- 5bb687f: Fix the public type namespace in the published declarations: `Trawl.Job`, `Trawl.JobCreateParams` and every other `Trawl.*` type resolved to a circular alias in 1.0.0 (TS2456 with `skipLibCheck` off, and an `any`-like type with it on). Method parameters and return types were not affected.

## 1.0.0

### Major Changes

- 66d5b1d: **@productcraft/trawl 1.0: generated resource methods, stable.** Every operation is now a method generated from the Trawl OpenAPI spec over the shared `@productcraft/core` runtime:
  - `trawl.jobs.create/retrieve/cancel/list`, `trawl.jobs.poll(id)` and `trawl.jobs.createAndPoll<T>(params)` (the type argument types `result`), `trawl.credits.retrieve()`, `trawl.stats.retrieve()`, `trawl.webhooks.endpoints.*`, `trawl.webhooks.events.*`, `trawl.webhooks.eventTypes.list()`.
  - `trawl.webhooks.unwrap({ payload, headers, secret? })` verifies a delivery and returns the typed event union (`job.succeeded`, `job.failed`, `credits.low`, then `UnknownWebhookEvent`).
  - Auto-pagination (`for await`), automatic `Idempotency-Key` on creates, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes (`NotFoundError`, `BadRequestError` with `errors[]`, …) carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`.
  - `new Trawl({ apiKey, workspaceId })`; `@productcraft/trawl/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

  Not breaking for `.client` users: `trawl.client` is still the typed `openapi-fetch` client over the same `paths`. The deprecated legacy `/webhooks` routes have no SDK methods (use `.client` or move to `webhooks.endpoints`). Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/trawl-1.0.0.md

## 0.2.5

### Patch Changes

- 32e342a: Refresh trawl OpenAPI types from production: descriptions on every operation, examples on every parameter and request field, and `GET /workspaces/{workspace_id}/credits` no longer takes a `limit` query (it always returns the 50 newest ledger entries; a `limit` sent anyway is ignored).

## 0.2.4

### Patch Changes

- b87f6f9: Refresh trawl OpenAPI types from production.

## 0.2.3

### Patch Changes

- 4a00e63: Refresh trawl OpenAPI types from production.
- Updated dependencies [1a6edbb]
  - @productcraft/core@0.4.0

## 0.2.2

### Patch Changes

- 534e23d: Refresh trawl OpenAPI types from production.

## 0.2.1

### Patch Changes

- fc081fa: Refresh trawl OpenAPI types from production.

## 0.2.0

### Minor Changes

- ed8300f: Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

### Patch Changes

- Updated dependencies [ed8300f]
  - @productcraft/core@0.3.0

## 0.1.3

### Patch Changes

- 67239e6: `json_schema` on job creation and `json_schema` / `result` on job responses are now typed `Record<string, unknown>` instead of `Record<string, never>`, so a real JSON Schema type-checks without an `as never` cast.

## 0.1.2

### Patch Changes

- f696df6: Refresh trawl OpenAPI types from production.
- 5adf146: Refresh trawl OpenAPI types from production.
- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.
- Updated dependencies [bee8f96]
  - @productcraft/core@0.2.1

## 0.1.1

### Patch Changes

- ee0f176: Routine spec refresh: trawl declares the 429 rate-limit response on job submission; minor auth description updates.

## 0.1.0

### Minor Changes

- 2904862: Add `@productcraft/trawl` — typed client for the ProductCraft Trawl AI
  web-extraction API (jobs + webhooks). Also surfaced on the `productcraft`
  umbrella as `pc.trawl`, and `PC_BASE_URL.trawl` added to `@productcraft/core`.

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/core@0.2.0

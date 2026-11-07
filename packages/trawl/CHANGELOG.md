# @productcraft/trawl

## 1.4.0

### Minor Changes

- b5edeb1: Re-export `PaymentRequiredError` (402). Trawl's `jobs.create` documents `402 TRAWL_CREDITS_EXHAUSTED`, so its JSDoc and api.md error table now list it.

  Noun model names from the spec: Trawl's stats are `Trawl.Stats`, `StatsTotals`, `StatsWindowTotals`, `StatsSeries` and `StatsSeriesPoint`; every product's webhook lists and replay are `WebhookEndpointList`, `WebhookEventList` and `WebhookEventReplay`. The former names (`TrawlWorkspaceStats`, `ListWebhookEndpoints`, `ReplayWebhookEvent`, …) stay as deprecated aliases. Examples name their results after the thing (`const webhookEndpoint`, `const stats`), not the response shape.

### Patch Changes

- Updated dependencies [b5edeb1]
  - @productcraft/core@1.3.0

## 1.3.0

### Minor Changes

- a689df7: From the app-waitlist review, in the generator:
  - **`signWebhook()` in `/testing`.** Every product with webhooks exports `signWebhook({ payload, secret })` from `@productcraft/<product>/testing`. It signs a test event the way ProductCraft signs deliveries, for a webhook handler test that has no client (the same as `webhooks.sign()`).
  - **Enum path arguments are typed.** A positional argument whose path parameter is an enum takes that union instead of `string`, so `auth.consumer(slug).auth.signinWithProvider("facebook", ...)` no longer compiles. A `string` variable needs narrowing to the union first.

## 1.2.0

### Minor Changes

- 9536669: App-mail review fixes, all from the spec or the shared runtime:
  - **`withResponse().rateLimit` works on every product.** ProductCraft APIs send one set of `X-RateLimit-*` headers per named window (`-short`, one second; `-long`, one minute), which 1.x parsed as nothing. `rateLimit` is now the binding window (fewest left), with `window` naming it and `windows` holding each one. New type `RateLimitWindow`.
  - **Mail: a send without content no longer compiles.** `Mail.EmailSendParams` (and each `emails.batch` row) is html with a subject, text with a subject, or a template; `mail.emails.send({ from, to })`, and html together with a template, are type errors instead of a 400 `EMAIL_CONTENT_CONFLICT`. The generated examples in api.md and the README send a body.
  - **Model names are nouns.** Mail: `EmailSendResponse` (was `SendEmail`), `EmailBatchResponse` (`SendBatchOpenApi`), `TemplateSendResponse` (`SendAccepted`), `MessageEraseResponse` (`DeleteByRecipient`), `IntegrationList`, `SmtpConfigList`, `TemplateTagList`; every product with webhooks: `WebhookEventTypeList` (was `ListWebhookEventTypes`). The old names stay as deprecated aliases for all of 1.x. Object models are named interfaces, so editors show `Mail.WebhookEndpointWithSecret`, not `components["schemas"]["WebhookEndpointWithSecretDto"]`.
  - **Mail: `received.timeline()`** is the daily count of received mail (it never counted sends). `messages.timeline()` and `Mail.MessageTimelineParams` stay as deprecated aliases.
  - **Mail: `mailboxes.messages.*(mailboxId, messageId)`** instead of `(id, mid)` (positional names only; calls are unchanged).
  - **Every product re-exports the runtime's types**: `import type { Page, PagePromise, APIPromise, RequestOptions, ClientOptions, PollOptions, WithResponse, RateLimitInfo, LastResponse } from "@productcraft/mail"`, and in the namespace (`Mail.Page<Mail.Email>`), so nothing has to import `@productcraft/core`, which strict pnpm and Yarn PnP refuse as a transitive dependency.

### Patch Changes

- Updated dependencies [9536669]
  - @productcraft/core@1.2.0

## 1.1.0

### Minor Changes

- 5084e47: `webhooks.sign({ payload })` signs a test event the way ProductCraft signs deliveries, for testing a handler with `webhooks.unwrap`. Reference examples use the spec's parameter examples, and type hovers no longer show the internal `Open<…>` wrapper.

### Patch Changes

- Updated dependencies [5084e47]
  - @productcraft/core@1.1.0

## 1.0.5

### Patch Changes

- 99207cc: Types now resolve for CommonJS consumers on `moduleResolution: node16`/`nodenext`: each `exports` entry points `require` at the CommonJS declarations (`dist/*.d.cts`) instead of the ESM `.d.ts`, which TypeScript rejected with TS1479. `@productcraft/<product>/testing` now resolves under `moduleResolution: node10` too (a `typesVersions` fallback). `@productcraft/auth` no longer imports jose's ESM-only types in its public declarations; `AuthClaims`, `AuthGetKeyFn` and the JWKS key types are structurally identical and still work with `jose.jwtVerify`. No runtime change.
- Updated dependencies [99207cc]
  - @productcraft/core@1.0.1

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

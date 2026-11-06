---
"@productcraft/trawl": major
---

**@productcraft/trawl 1.0: generated resource methods, stable.** Every operation is now a method generated from the Trawl OpenAPI spec over the shared `@productcraft/core` runtime:

- `trawl.jobs.create/retrieve/cancel/list`, `trawl.jobs.poll(id)` and `trawl.jobs.createAndPoll<T>(params)` (the type argument types `result`), `trawl.credits.retrieve()`, `trawl.stats.retrieve()`, `trawl.webhooks.endpoints.*`, `trawl.webhooks.events.*`, `trawl.webhooks.eventTypes.list()`.
- `trawl.webhooks.unwrap({ payload, headers, secret? })` verifies a delivery and returns the typed event union (`job.succeeded`, `job.failed`, `credits.low`, then `UnknownWebhookEvent`).
- Auto-pagination (`for await`), automatic `Idempotency-Key` on creates, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes (`NotFoundError`, `BadRequestError` with `errors[]`, …) carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`.
- `new Trawl({ apiKey, workspaceId })`; `@productcraft/trawl/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

Not breaking for `.client` users: `trawl.client` is still the typed `openapi-fetch` client over the same `paths`. The deprecated legacy `/webhooks` routes have no SDK methods (use `.client` or move to `webhooks.endpoints`). Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/trawl-1.0.0.md

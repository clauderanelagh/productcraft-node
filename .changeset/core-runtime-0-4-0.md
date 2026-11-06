---
"@productcraft/core": minor
---

New shared runtime for the generated SDKs: `APIClient` with retries (exponential backoff, full jitter, `Retry-After`), automatic `Idempotency-Key` reused across retries, per-attempt timeouts and `AbortSignal`, `APIPromise` (`.withResponse()` with `requestId` and `rateLimit`, `.asResponse()`), a non-enumerable `lastResponse` on every result, cursor pagination (`for await`, `.pages()`, `.toArray({ maxItems })`), polling (`poll`, `createAndPoll`), workspace-id resolution, a browser guard (`dangerouslyAllowBrowser`), `logLevel`/`logger`, and `verifyWebhook` for Standard Webhooks and the legacy `X-<Product>-Signature` scheme. Errors are classes you can catch (`APIError`, `NotFoundError`, `RateLimitError`, `IdempotencyKeyReuseError`, `ConfigurationError`, ...) and `instanceof` works across the ESM and CJS builds. A POST or PATCH without an idempotency key is never retried.

Existing exports (`PCAuth`, `PCClientConfig`, `PC_BASE_URL`, `resolveAuth`, `makeClient`, ...) are unchanged; `makeClient` is deprecated in favour of `APIClient` + `createOpenAPIClient`.

**Node 20.3 or later is now required** (`engines: ">=20.3"`): Node 18 is end-of-life and lacks `AbortSignal.any`. The other packages declare the same floor from their next release.

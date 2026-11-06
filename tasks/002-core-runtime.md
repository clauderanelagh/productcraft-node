# 002 — Shared runtime in @productcraft/core

**Status:** pending
**Priority:** 2
**Dependencies:** 001. Does not wait for the monorepo spec tasks: `requestId`, `errors[]` and `IDEMPOTENCY_IN_PROGRESS` are tested against the mock server here and live in 004.

## Summary

Write the hand-written runtime every generated method calls, exactly as `docs/sdk-standard.md` section 4 specifies: `APIClient.request()`, `APIPromise` (`withResponse` with `rateLimit`, `asResponse`), non-enumerable `lastResponse`, `PagePromise`/`Page` (async iteration, `.pages()`, `getNextPage`, `toArray({ maxItems })`), polling (`poll`, `createAndPoll`), retries with backoff, jitter and Retry-After, automatic Idempotency-Key reused across retries, timeouts and AbortSignal, the branded error hierarchy (`errors[]`, `docUrl`, `ConfigurationError`), per-request options, workspace-id resolution (option, env, `GET /v1/api-keys/self` for workspace keys only, cached per process, own timeout), the browser guard (`dangerouslyAllowBrowser`), `verifyWebhook` (object args, string or array secret, Node or Fetch headers), User-Agent, `logLevel` + `logger`. Keep `makeClient`, `PCAuth`, `resolveAuth`, `PC_BASE_URL` exported (deprecated where superseded).

## Context

- The contract: `docs/sdk-standard.md` section 4. Any deviation updates the doc in the same PR.
- Prototype that passed a mock-server smoke: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/proto/inhouse/runtime/core.ts` (uses `AbortSignal.any`, hence Node 20.3).
- Memory `feedback_tsup_esm_bare_require.md` (createRequire + shims, smoke the built dist).

## Requirements

- Every row of section 4 implemented, zero new runtime deps beyond `openapi-fetch`.
- `engines: ">=20.3"` in **every** package.json; CI smoke matrix Node 20, 22, 24.
- Retry rules exactly as written: never retry a POST/PATCH without an idempotency key (connection errors included); retry 409 only for `IDEMPOTENCY_IN_PROGRESS`.
- Error classes branded with `Symbol.for("productcraft.error.<Name>")` + `static [Symbol.hasInstance]`; the dist smoke loads the ESM and CJS builds in one process and asserts cross-build `instanceof`.
- Contract test suite against a local mock HTTP server (node:http): retry matrix per status and method, Retry-After seconds/date/ms and the 60 s cap, POST without key not retried, key stable across attempts and overridable, pagination over 3 pages with `toArray` cap and `.pages()`, poll to terminal and poll timeout, timeout vs user abort, error mapping incl. `IDEMPOTENCY_KEY_REUSE`, array `message`, envelope `errors` to `errors[]` and `details` passed through, `requestId` from header then body, `lastResponse` non-enumerable (absent from `JSON.stringify`), non-JSON response returned as `Response`, workspace lookup cached once and `ConfigurationError` on failure and on bearer credentials, browser guard.
- Webhook test vectors: Standard Webhooks published vectors plus a vector produced by `libs/webhooks-lib` in the monorepo (copy the signing code path, not a secret), multiple secrets, rotation (multiple signatures), tolerance window, tampered body, `IncomingHttpHeaders` and `Headers` inputs.
- `crypto.subtle` only; constant-time compare.
- `sideEffects: false`; ESM and CJS smoke of `dist` in CI (`scripts/smoke-dist.mjs`); size budget measured with an esbuild one-call bundle and recorded in CI (limit = first measurement + 10%).
- Changeset `minor` for `@productcraft/core` (0.4.0, stable; no pre mode). The changeset notes the Node 20.3 engines floor.

## Out of Scope

- Generated resources (003). Product packages keep working unchanged on the old exports.

## Testing

- The contract suite above, plus the dist smoke on three Node versions.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

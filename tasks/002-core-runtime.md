# 002 — Shared runtime in @productcraft/core

**Status:** pending
**Priority:** 2
**Dependencies:** 001; monorepo tasks/monorepo/020 deployed (request id), so `requestId` can be tested live

## Summary

Write the hand-written runtime every generated method calls: `APIClient.request()`, `APIPromise` (`withResponse`, `asResponse`), `PagePromise`/`Page` (async iteration, `getNextPage`, `toArray({ limit })`), retries with backoff, jitter and Retry-After, automatic Idempotency-Key reused across retries, timeouts and AbortSignal, the error class hierarchy, per-request options, workspace-id resolution (option, env, `GET /v1/api-keys/self`), `verifyWebhook` (Standard Webhooks + legacy `t=,v1=`), User-Agent, logging. Keep `makeClient`, `PCAuth`, `resolveAuth`, `PC_BASE_URL` exported (deprecated where superseded).

## Context

- The contract: `docs/sdk-standard.md` section 4. Treat it as the spec; any deviation updates the doc in the same PR.
- Prototype that already passed a mock-server smoke (429 + Retry-After, same auto key on retry, 3-page pagination, NotFoundError with code + requestId, timeout, withResponse; built ESM and CJS): `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/proto/inhouse/runtime/core.ts`.
- Memory `feedback_tsup_esm_bare_require.md` (createRequire + shims, smoke the built dist).

## Requirements

- Every row of section 4 implemented, with zero new runtime deps beyond `openapi-fetch`.
- Contract test suite against a local mock HTTP server (node:http): retry matrix per status, Retry-After seconds/date/ms and the 60 s cap, POST without key not retried, idempotency key stable across attempts and overridable, pagination across 3 pages and the `toArray` cap, timeout vs user abort, error mapping incl. `IDEMPOTENCY_KEY_REUSE` and array `message`, `requestId` from header then body.
- Webhook test vectors: the Standard Webhooks published vectors plus a vector produced by `libs/webhooks-lib` in the monorepo (copy the signing code path, not a secret), secret rotation (multiple signatures), tolerance window, tampered body.
- `crypto.subtle` only (works on edge runtimes); constant-time compare.
- `sideEffects: false`; ESM and CJS smoke of `dist` in CI (`scripts/smoke-dist.mjs`); size budget check (core <= 6 KB gzip).
- Changesets pre mode entered (`pnpm changeset pre enter next`) in this PR; core changeset `major` (publishes `1.0.0-next.0`).

## Out of Scope

- Generated resources (003). Product packages keep working unchanged on the old exports.

## Testing

- The contract suite above, plus the dist smoke.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

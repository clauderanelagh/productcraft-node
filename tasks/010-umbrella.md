# 010 — Umbrella `productcraft` on the generated products

**Status:** pending
**Priority:** 10
**Dependencies:** 004-009

## Summary

`new ProductCraft({ apiKey, workspaceId })` with `pc.mail`, `pc.waitlist`, `pc.social`, `pc.trawl`, `pc.platform` (alias `pc.platformAuth` kept), `pc.auth`, sharing one runtime config (retries, timeout, fetch, logLevel, logger, dangerouslyAllowBrowser) and one resolved workspace id. Fix the umbrella JSDoc whose example path does not exist. Publishes `productcraft@0.4.0` stable (pinned to the stable products and auth 0.8.x); 012 moves it to 1.0.0 with auth 1.0.

## Context

- `packages/umbrella/src/index.ts`; `docs/sdk-standard.md` 2.1.
- `overrides` (nested per product) stays: the flat `auth` key collides with the credential field.

## Requirements

- `apiKey` shorthand plus `auth: PCAuth` both accepted; workspace id resolved once and shared.
- Products constructed lazily so an app that only uses `pc.mail` does not pay for the others at startup.
- Every error class, `verifyWebhook` and each product's type namespace (`import type { Mail } from "productcraft"`) re-exported.
- README and JSDoc examples pass the snippet check; `index.ts` within the hand-written allowlist cap.

## Testing

- Unit tests for config fan-out and lazy construction; dist smoke; one live read-only call per product in testing-environment.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset `minor` for `productcraft`; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`).
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

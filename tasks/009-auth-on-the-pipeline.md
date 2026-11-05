# 009 — Auth moves onto the generator without losing what it does well

**Status:** pending
**Priority:** 9
**Dependencies:** 005-008 merged (pipeline proven on four products); monorepo users-api/096 deployed and the spec refreshed

## Summary

Retire kubb and the ~1,000 hand-written lines in `packages/auth/src/scopes/`. Generate all ~224 Auth operations (today 62-73 are reachable) under `auth.app(id)` and `auth.consumer(slug)`, keep the hand-written crypto and ceremonies, and keep every 0.8.0 name working through a deprecation alias table. Publishes `@productcraft/auth@1.0.0` and `@productcraft/auth-passport@1.0.0`.

## Context

- `docs/sdk-standard.md` sections 3.3, 3.4, 6, 7.
- Kept by hand: `verifyToken` (JWKS cache, issuer/audience pinning, refresh-token refusal, JWT error hierarchy), `passkeys.*`, env fallback that keeps the workspace key off consumer routes (`index.ts:45-69`), `AUTH_LEGACY_ISSUER`.
- Stale `callDirect` workarounds (`scopes/app.ts:25,33,221-248`, `consumer.ts:38,416-446`) go away; users-api/096 fixes the header-param `authorization` that forced `signup` to `unknown`.
- Consumers relying on names: conquer-api (signup, signin, signinWithProvider, refresh, logout, verify, sendVerificationEmail, sendPasswordResetEmail, resetPassword, me.getProfile/updateProfile/deleteAccount; AuthHttpError, JwtExpiredError, JwtVerifyError; createPassportSecretOrKeyProvider), WriteWave, productcraft.co Auth docs (65 namespace.method pairs, all resolved in the consumers audit).

## Requirements

- `packages/auth/src/compat.ts`: alias table from every 0.8.0 scope method to its generated method, each `@deprecated` with the new name; a test enumerates the 0.8.0 public surface (snapshot it before deleting the scopes) and asserts every name still exists and calls the same route.
- `AuthHttpError` exported as an alias of `APIError`; `instanceof AuthHttpError` true for every API error.
- Path and query params snake_case (one casing rule); the migration guide lists every changed field.
- `me.getProfile()` and `auth.signup()` typed (no `unknown`).
- auth-passport: peer range `^1`, both ESM and CJS dist smoke, `createAuthJwtStrategy`/`createPassportSecretOrKeyProvider` unchanged.
- kubb, `kubb.config.ts` and its devDeps removed; `scripts/codegen.sh` has one path.
- Live smoke in testing-environment against a throwaway Auth app created and deleted by the script: signup + signin + refresh + `verifyToken` + me.getProfile, `app.endUsers.list` iterated, an outbound-webhooks endpoint created and deleted, a 404 with requestId. Mail-triggering flows only to `success@simulator.amazonses.com`.

## Testing

- Compat snapshot test, contract tests, dist smoke for auth and auth-passport, live smoke.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

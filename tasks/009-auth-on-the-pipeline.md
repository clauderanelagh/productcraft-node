# 009 — Auth 1.0 on the pipeline (previews under `next`)

**Status:** pending
**Priority:** 9
**Dependencies:** 005-008 merged (pipeline proven on four products); monorepo users-api/096 deployed and the spec refreshed

## Summary

Retire kubb and the ~1,000 hand-written lines in `packages/auth/src/scopes/`. Generate all ~224 Auth operations under `auth.admin.app(id)` (alias `auth.app(id)`) and `auth.consumer(slug)` (flattened: `consumer(slug).signin`, not `.auth.signin`), keep the hand-written crypto and ceremonies, expose `auth.verifyToken(jwt, { app })` at the top level, and keep every 0.6.x and 0.8.0 name working through a generated alias file. Publishes `@productcraft/auth@1.0.0-next` snapshots and `auth-passport` snapshots under the `next` dist-tag; 012 makes them stable.

## Context

- `docs/sdk-standard.md` sections 3.3, 3.4, 3.5, 6, 7.
- Kept by hand: `verifyToken` (JWKS cache, issuer/audience pinning, refresh-token refusal, JWT error hierarchy), `passkeys.*`, `oauth.clientCredentials`, env fallback that keeps the workspace key off consumer routes (`index.ts:45-69`), `AUTH_LEGACY_ISSUER`.
- Stale `callDirect` workarounds (`scopes/app.ts:25,33,221-248`, `consumer.ts:38,416-446`) go away; users-api/096 fixes the header-param `authorization` that forced `signup` to `unknown`.
- Flattening `consumer.auth.*` onto the scope root collides email `verify` with the `verify.authorize*` resource; users-api/096 names it (`verifyEmail`) and the alias keeps `auth.verify`.
- Consumers relying on names: conquer-api and WriteWave on `^0.6.0` (signup, signin, signinWithProvider, refresh, logout, verify, sendVerificationEmail, sendPasswordResetEmail, resetPassword, me.getProfile/updateProfile/deleteAccount; AuthHttpError, JwtExpiredError, JwtVerifyError; createPassportSecretOrKeyProvider). They stay on their pins (standard section 11); compat makes a later upgrade a bump plus the casing table. productcraft.co Auth docs (65 namespace.method pairs).

## Requirements

- `packages/auth/compat.json`: frozen map from every 0.8.0 and 0.6.x public name (snapshot both published versions from npm before deleting the scopes) to its operationId or hand-written target; `compat.ts` generated from it, each alias `@deprecated` with the new name. A test enumerates both snapshots and asserts every name exists and calls the same route.
- `AuthHttpError` exported as an alias of `APIError`; `instanceof AuthHttpError` true for every API error, across ESM/CJS builds.
- Path and query params snake_case (one casing rule); the migration guide `docs/migrations/auth-1.0.0.md` lists every changed field and every flattened or renamed method.
- `me.getProfile()` and `signup()` typed (no `unknown`).
- auth-passport: peer range `^1.0.0-0 || ^1`, ESM and CJS dist smoke, `createAuthJwtStrategy`/`createPassportSecretOrKeyProvider` unchanged.
- kubb, `kubb.config.ts` and its devDeps removed; `scripts/codegen.sh` has one path.
- `release.yml` gains a `workflow_dispatch` input that runs `changeset version --snapshot next` + `changeset publish --tag next` in the same file (trusted publisher is bound to the filename). Snapshots published from it; `latest` stays on 0.8.x.
- Live smoke in testing-environment against a throwaway `sdk-smoke-<ts>` Auth app the script creates and deletes (stale `sdk-smoke-*` apps deleted first; no change to the workspace's services or settings): signup + signin + refresh + `verifyToken` + `me.getProfile`, `admin.app().endUsers.list` iterated, an outbound-webhooks endpoint created and deleted, a 404 with requestId. Mail-triggering flows only to `success@simulator.amazonses.com`.

## Testing

- Compat snapshot test, generated per-op test, contract tests, dist smoke for auth and auth-passport on Node 20/22/24, live smoke.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset `major` for auth and auth-passport (consumed by 012's stable release); snapshot published under `next` via the `release.yml` dispatch; `npm view @productcraft/auth dist-tags` shows `next` and an unchanged `latest`
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

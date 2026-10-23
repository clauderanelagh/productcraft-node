# 001 — Env credential fallback: PRODUCTCRAFT_API_KEY when `auth` is omitted

**Status:** pending
**Priority:** 1
**Dependencies:** none. Merge now; it ships with the next publish after the npm 2FA reset. Console side: monorepo `tasks/console/083-env-defaults-and-key-names.md`.
**Decision:** open-decisions 2026-10-23 "sdk-env-defaults" (Robert delegated). Stripe-style: credentials from env, overrides in code (`baseUrl` / `overrides`), no per-product URL env vars.

## Summary

Every client requires an explicit `auth` today (READMEs use `process.env.PCFT_KEY!`). Let the server-side SDK fall back to `PRODUCTCRAFT_API_KEY` (the `pcft_` workspace key) when `auth` is omitted, default the consumer slug from `PRODUCTCRAFT_AUTH_APP`, and never read URL env vars. `Auth.app(appId)` takes an app UUID and hits `/v1/apps/:appId`, where a PAK is the first-class credential; the SDK does not wrap `/:slug/v1/admin/*`, so nothing reads `PRODUCTCRAFT_AUTH_APP_KEY` yet.

## Context

- `packages/auth/src/index.ts`: `app(appId: string)` (:60), `consumer(appSlug: string)` (:69), one shared client today.
- Packages: auth, auth-passport, core, mail, platform-auth, social, trawl, waitlist, umbrella.

## Requirements

- [ ] Env fallback only when `auth` is omitted, guarded by `typeof process !== 'undefined'`:
  - Mail, Waitlist, Social, Trawl, PlatformAuth and `Auth.app(appId)` read `PRODUCTCRAFT_API_KEY`. `app()` keeps its required `appId` (a UUID); no slug default.
  - `consumer(slug?)` defaults ONLY the slug, from `PRODUCTCRAFT_AUTH_APP`, and reads no credential from the environment.
  - Split Auth's shared client into an admin client (with the env fallback) and a consumer client (explicit `auth` only). An explicit `auth` still goes to both, so `signup_requires_pak` and the PAK-only consumer routes (tenants, code mint, factors) keep working.
- [ ] No URL env vars and no `PRODUCTCRAFT_AUTH_APP_KEY` are read anywhere.
- [ ] README (each affected package + umbrella): the minimal `.env` (`PRODUCTCRAFT_API_KEY`, `PRODUCTCRAFT_AUTH_APP`), override examples, a "server-only fallback; never put a key in NEXT_PUBLIC_*" note, and explicit `auth` for PAK-only consumer routes. Replace `PCFT_KEY` in examples.
- [ ] Minor changeset for every changed package.
- [ ] Optional: switch the JWKS URL to the canonical `/<slug>/.well-known/jwks.json` (the `/v1` path is a permanent alias).

## Testing

- With `PRODUCTCRAFT_API_KEY` set, `new Auth().consumer(slug)` sends NO Authorization header.
- Explicit `auth` still reaches consumer routes (`signup_requires_pak`, tenants).
- `app()` picks up the env key; each product client picks up the env key; explicit `auth` wins over env.
- Without `process` (simulated browser), no fallback and no crash.
- Smoke-test the built dist from both ESM and CJS (see the tsup ESM bare-require trap note).

## Definition of Done

- [ ] This file deleted in the merge PR; squash-merged; changesets present; dist smoke tests pass. Publishing waits for the npm 2FA work.

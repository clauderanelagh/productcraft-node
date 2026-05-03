# productcraft-node — Claude Instructions

## What this repo is

The Node.js / TypeScript SDK for the ProductCraft platform. **Generated from the production OpenAPI specs** via [`openapi-typescript`](https://openapi-ts.dev/) (types only) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (the typed runtime client). Public, MIT-licensed, distributed via npm as `productcraft`.

Five surface classes — `Heimdall`, `Envoi`, `Rally`, `Agora`, `PlatformAuth` — plus the umbrella `ProductCraft` class that instantiates one of each.

## The maintenance contract

The SDK is supposed to need **as little ongoing dev effort as possible**. Three rules keep that true:

1. **Never hand-edit `src/_generated/`.** That dir is rewritten by `pnpm run codegen` from `Specs/<surface>.json`. It's gitignored. If a generated type is wrong, fix the OpenAPI spec at the source (the monorepo's `@nestjs/swagger` annotations), redeploy, then run `pnpm run refresh-specs && pnpm run codegen`.
2. **Specs are the contract.** Vendored under `Specs/<surface>.json`. `scripts/refresh-specs.sh` is the only thing that writes them.
3. **Hand-written code lives only in:**
   - `src/_core.ts` — auth helpers (`PCAuth`, `authMiddleware`), `makeClient`, `PC_BASE_URL` constants.
   - `src/<surface>.ts` — per-surface class (`Heimdall`, `Envoi`, …). Today these are thin wrappers around `openapi-fetch`; future versions add ergonomic resource wrappers (`heimdall.signin({ email, password })` instead of `heimdall.client.POST("/v1/...")`).
   - `src/index.ts` — umbrella `ProductCraft` class + re-exports.

## The four files / dirs to touch

| If you want to … | Edit |
|---|---|
| Add a new endpoint to the SDK | Don't. Update `@nestjs/swagger` annotations in the monorepo, redeploy, then `pnpm run refresh-specs && pnpm run codegen`. |
| Add an ergonomic wrapper for an existing endpoint | `src/<surface>.ts` |
| Change auth header logic | `src/_core.ts` |
| Add a new API surface | New entry in `tsup.config.ts` + new `src/<name>.ts` + add to `Specs/` + `scripts/refresh-specs.sh` + `package.json#scripts.codegen` + `src/index.ts` umbrella |

## CI workflows

- `ci.yml` — install + codegen + lint + build + test on every PR + push to main.
- `spec-refresh.yml` — nightly cron + manual dispatch. Fetches latest `/docs-json` from each prod API, runs codegen, opens a PR if anything changed. Merge when CI is green.
- `release.yml` — fires on `v*.*.*` tags. Builds, tests, creates a GitHub Release, publishes to npm if `NPM_TOKEN` secret is set on the repo.

## Versioning

SemVer. Pre-1.0 (`v0.x.y`):
- `0.x.0` minor bumps for additive surface changes.
- `0.x.y` patch bumps for the spec-refresh PRs (the most common churn).

The SDK version is **not** lock-stepped to the platform API version.

## Don't

- Don't commit `src/_generated/` or `dist/`.
- Don't hand-edit `Specs/<surface>.json` — that's overwritten by `scripts/refresh-specs.sh`.
- Don't import directly from `src/_generated/` in user-facing code paths — go through the per-surface class so the abstraction stays consistent.
- Don't pin `openapi-typescript` or `openapi-fetch` to specific minor versions unless there's a known incompat.

# productcraft-node — Claude Instructions

## What this repo is

A pnpm workspace holding the Node.js / TypeScript SDKs for the ProductCraft platform. Each product is its own npm package:

| npm package | dir | What it wraps |
|---|---|---|
| `@productcraft/core` | `packages/core` | Shared auth + transport (`PCAuth`, `makeClient`, `PC_BASE_URL`). Dep of every other package. |
| `@productcraft/auth` | `packages/auth` | Auth Consumer + Admin API |
| `@productcraft/mail` | `packages/mail` | Mail API (mail-api) |
| `@productcraft/waitlist` | `packages/waitlist` | Waitlist API (waitlists) |
| `@productcraft/social` | `packages/social` | Social API (feeds, communities) |
| `@productcraft/trawl` | `packages/trawl` | Trawl API (AI web extraction — jobs + webhooks) |
| `@productcraft/platform-auth` | `packages/platform-auth` | Platform-Auth (workspaces) |
| `@productcraft/auth-passport` | `packages/auth-passport` | Passport-JWT adapter for Auth (not a surface; wraps `@productcraft/auth`) |
| `productcraft` (umbrella) | `packages/umbrella` | Convenience class that instantiates one of each. Depends on all six surface packages. |

All packages are **generated from the production OpenAPI specs** via [`openapi-typescript`](https://openapi-ts.dev/) (types only) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (the typed runtime client). Public, MIT-licensed.

## The maintenance contract

The SDKs are supposed to need **as little ongoing dev effort as possible**. Three rules keep that true:

1. **Never hand-edit `packages/<surface>/src/_generated.d.ts`.** That file is rewritten by `pnpm run codegen` from `Specs/<surface>.json`. It's gitignored. If a generated type is wrong, fix the OpenAPI spec at the source (the monorepo's `@nestjs/swagger` annotations), redeploy, then run `pnpm run refresh-specs && pnpm run codegen`.
2. **Specs are the contract.** Vendored under `Specs/<surface>.json` at the repo root. `scripts/refresh-specs.sh` is the only thing that writes them.
3. **Hand-written code lives only in:**
   - `packages/core/src/index.ts` — auth helpers (`PCAuth`, `authMiddleware`), `makeClient`, `PC_BASE_URL` constants.
   - `packages/<surface>/src/index.ts` — per-surface class (`Auth`, `Mail`, …). Today these are thin wrappers around `openapi-fetch`; future versions add ergonomic resource wrappers (`auth.signin({ email, password })` instead of `auth.client.POST("/v1/...")`).
   - `packages/umbrella/src/index.ts` — `ProductCraft` umbrella class + re-exports.

## Where to make changes

| If you want to … | Edit |
|---|---|
| Add a new endpoint to a surface | Don't. Update `@nestjs/swagger` annotations in the monorepo, redeploy, then `pnpm run refresh-specs && pnpm run codegen`. |
| Add an ergonomic wrapper for an existing endpoint | `packages/<surface>/src/index.ts` |
| Change auth header logic | `packages/core/src/index.ts` |
| Add a new API surface (rare) | New package under `packages/<name>/` — **mirror `packages/mail/`, not `packages/auth/`** (auth is the one special case: it uses kubb; every other surface uses plain `openapi-typescript`). Then: add the surface to `PC_BASE_URL` in `packages/core/src/index.ts`, `scripts/refresh-specs.sh`, the `openapi-typescript` loop in `scripts/codegen.sh`, and wire it into `packages/umbrella/` (import/export, `ProductCraftOverrides`, constructor field, `package.json` dep). New package starts at `version: 0.0.0` so a `minor` changeset lands it at `0.1.0`. See PR #41 (`@productcraft/trawl`) for the reference diff. |

## CI workflows

- `ci.yml` — install + codegen + lint + build + test on every PR + push to main.
- `spec-refresh.yml` — nightly cron + manual dispatch. Fetches latest `/docs-json` from each prod API, runs codegen, emits a Changesets entry **per surface that changed**, and opens a PR. Merging the PR triggers `release.yml` which then opens a "Version Packages" PR with just the right bumps.
- `release.yml` — fires on every push to main. Uses [`changesets/action@v1`](https://github.com/changesets/action). Two modes:
   1. If `.changeset/*.md` files exist → opens / updates a "Version Packages" PR.
   2. If there are no pending changesets but `package.json` versions are ahead of npm → publishes via **Trusted Publishing (OIDC)**. No `NPM_TOKEN` secret; the workflow has `id-token: write` and npm CLI 11.5.1+ exchanges the GitHub OIDC token for a publish token. Each package's `publishConfig.provenance: true` adds an attestation.

## Versioning

SemVer, **per package**, independent. The `productcraft` umbrella picks up a patch bump whenever any of its surface deps bump (via `updateInternalDependencies: "patch"` in `.changeset/config.json`).

Pre-1.0 (`v0.x.y`):
- `0.x.0` minor bumps for additive surface changes.
- `0.x.y` patch bumps for spec-refresh PRs (the common churn).

The SDK version is **not** lock-stepped to the platform API version.

To add a manual version-bump for non-spec changes:
```bash
pnpm changeset       # interactive: pick packages + bump type
```

## Don't

- Don't commit `packages/*/src/_generated.d.ts` or `packages/*/dist/`.
- Don't hand-edit `Specs/<surface>.json` — overwritten by `scripts/refresh-specs.sh`.
- Don't import directly from `_generated.d.ts` in user-facing code paths — go through the per-surface class so the abstraction stays consistent.
- Don't pin `openapi-typescript` or `openapi-fetch` to specific minor versions unless there's a known incompat.
- Don't add packages outside `packages/` — the workspace glob (`pnpm-workspace.yaml`) only picks up that dir.

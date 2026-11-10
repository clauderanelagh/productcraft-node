# productcraft-node — Claude Instructions

## What this repo is

A pnpm workspace holding the Node.js / TypeScript SDKs for the ProductCraft platform. Each product is its own npm package:

| npm package | dir | What it wraps |
|---|---|---|
| `@productcraft/core` | `packages/core` | The shared runtime (`APIClient`, retries, errors, pagination, webhooks) plus the 0.x helpers (`PCAuth`, `makeClient`, `PC_BASE_URL`). Dep of every other package. |
| `@productcraft/auth` | `packages/auth` | Auth Consumer + Admin API |
| `@productcraft/mail` | `packages/mail` | Mail API (mail-api) |
| `@productcraft/waitlist` | `packages/waitlist` | Waitlist API (waitlists) |
| `@productcraft/social` | `packages/social` | Social API (feeds, communities) |
| `@productcraft/trawl` | `packages/trawl` | Trawl API (AI web extraction — jobs + webhooks) |
| `@productcraft/platform-auth` | `packages/platform-auth` | Platform-Auth (workspaces) |
| `@productcraft/flags` | `packages/flags` | Flags management API (generated) plus the hand-written `FlagsClient` (`src/client/**`: download loop, cache, overrides, hooks) over `@productcraft/flags-engine`; `./testing` adds `createTestClient`. The `browser` / `react-native` export conditions point at `dist/browser/` (tsup swaps `src/client/platform.ts` for `platform.browser.ts`). |
| `@productcraft/flags-engine` | `packages/flags-engine` | Flags evaluation engine: parses a config JSON and evaluates flags locally (hand-written, zero dependencies; `SPEC.md`, JSON Schema and test vectors ship in the package). Not an API surface. |
| `@productcraft/flags-openfeature` | `packages/flags-openfeature` | OpenFeature server provider over `FlagsClient` (hand-written, allowlisted; peers `@openfeature/server-sdk` and `@productcraft/flags`). Not an API surface. |
| `@productcraft/notify` | `packages/notify` | Notify API (generated): recipients, preferences, notification types and templates, sends, deliveries, channels, webhooks, plus the browser-safe recipient-token scope `notify.client({ token })` (the `me.*` client routes, a generator token scope). |
| `@productcraft/flags-react` | `packages/flags-react` | React bindings over `FlagsClient` (`FlagsProvider`, `useFlag`, `useFlagDetails`, `useFlagsClient`, `useFlagsReady`; SSR bootstrap). Hand-written, allowlisted; peers `react` >= 18 and `@productcraft/flags`. Not an API surface. |
| `@productcraft/notify-js` | `packages/notify-js` | Notify browser / React Native core (hand-written, allowlisted): `createNotifyClient({ getToken })` with inbox stores, the fetch-stream SSE reader, preferences, devices, `registerWebPush` and the `notify-sw.js` service worker. Depends on `@productcraft/notify` for every call. Not an API surface. |
| `@productcraft/notify-react` | `packages/notify-react` | React components and hooks over notify-js (hand-written, allowlisted): `NotifyProvider`, `<NotifyInbox/>`, `<NotifyPreferences/>`, `useInbox`, `usePreferences`; localised strings, `styles.css` theme, `"use client"`. Peers `react`/`react-dom` >= 18. Browser test `tests/browser/run.mjs`; Next.js fixture + live check `examples/notify-react-next/run.mjs`. Not an API surface. |
| `@productcraft/auth-passport` | `packages/auth-passport` | Passport-JWT adapter for Auth (not a surface; wraps `@productcraft/auth`) |
| `productcraft` (umbrella) | `packages/umbrella` | Convenience class that instantiates one of each. Depends on all six surface packages. |

All packages are **generated from the production OpenAPI specs**: types by [`openapi-typescript`](https://openapi-ts.dev/), resource methods, docs, mocks and tests by `scripts/gen-sdk.mjs`, over the shared runtime in `@productcraft/core`; `.client` is the typed [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) escape hatch. Public, MIT-licensed. `packages/gen-fixture` (`@productcraft/gen-fixture`) is the generator's private test fixture and is never published.

## The maintenance contract

The SDKs are supposed to need **as little ongoing dev effort as possible**. Nothing per endpoint is hand-written:

1. **One generator.** `scripts/gen-sdk.mjs` (plus `scripts/gen-sdk/*.mjs`) turns `Specs/<surface>.json` into `packages/<surface>/src/_generated/` (`paths.d.ts`, `types.ts`, `resources.ts`, `client.ts`, `errors.ts`, `runtime.ts`, `webhooks.ts`, `testing.ts`, `manifest.json`) and `tests/_generated/operations.test.ts`, all gitignored, plus the **checked-in** `packages/<surface>/api.md`, the README region between `<!-- generated:start … -->` and `<!-- generated:end -->`, and `examples/<surface>/*.ts`. Names, scopes, pagination, polling and `public` come only from the spec's `x-pc-sdk`; type names from `x-pc-sdk-model` (`docs/sdk-standard.md` section 3). It fails loudly (missing `x-pc-sdk`, collisions, reserved names, unresolved `$ref`, `Record<string, never>` in a request body) and has no soft mode.
2. **Never hand-edit generated output**, checked-in or not. If a name or type is wrong, fix the API's `@nestjs/swagger` / `@SdkMethod` / `@SdkModel` annotations in the monorepo, deploy, then `pnpm run refresh-specs && pnpm run codegen`.
3. **Specs are the contract.** Vendored under `Specs/<surface>.json`; `scripts/refresh-specs.sh` is the only thing that writes them.
4. **Hand-written code is on an allowlist** (`scripts/handwritten-allowlist.json`, enforced by `scripts/check-handwritten.mjs`): `packages/core/src/**` (the shared runtime: `APIClient`, `APIPromise`, pagination, polling, retries, branded errors, `verifyWebhook`, plus the 0.x helpers in `legacy.ts`), each package's `src/index.ts` (at most 60 lines: re-exports of the generated client plus hand-written extras such as Auth's `verifyToken`), Auth's JWT and passkey code, auth-passport, and the umbrella. Product identity (class name, base URL, scope accessors such as `community(id)` and `public({ workspace, waitlist })`) lives in the `SURFACES` table at the top of `scripts/gen-sdk.mjs`, not in per-package code.
5. **Every product is on the generator** (`SURFACES`): `@productcraft/trawl`, `flags` (0.1, plus the hand-written `FlagsClient`), `notify` (0.1), `mail`, `waitlist`, `platform-auth` (1.0), `social` (1.1) and `auth` (1.0), plus the private test fixture `packages/gen-fixture` (spec `packages/gen-fixture/fixture.openapi.json`). kubb is gone. Each has a live smoke in `scripts/live/<p>.mjs` (testing-environment only) and a migration guide in `docs/migrations/`. Auth's hand-written parts: `src/base.ts` (the generated `Auth` extends it: `consumer(slug)`, top-level `verifyToken`), `src/consumer.ts` (`ConsumerScope` over the generated consumer scope: `verifyToken`, `jwks`, passkeys), `src/jwt/`, `src/passkeys.ts`, and the frozen 0.x name map `packages/auth/compat.json` (the generator emits the deprecated aliases from it; deleted in 2.0).

`pnpm run codegen` is the single entry point. Core's contract suite runs against a local `node:http` mock server (`packages/core/tests/`); `scripts/smoke-dist.mjs` checks the built ESM + CJS dist (CI: Node 20.3.0, 20, 22, 24) and `scripts/size-budget.mjs` the bundle budget.

## The SDK standard (2026-11)

[`docs/sdk-standard.md`](docs/sdk-standard.md) is the contract: target DX, naming rules (`x-pc-sdk`), runtime, generator rules, versioning and the ordered tasks in `tasks/`. Where this file and the standard disagree, the standard wins.

## Where to make changes

| If you want to … | Edit |
|---|---|
| Add or rename an endpoint, param, model or method name | Don't touch the SDK. Change the API in the monorepo (`@nestjs/swagger`, `@SdkMethod`, `@SdkModel`), deploy, then `pnpm run refresh-specs && pnpm run codegen`. |
| Change what every generated method, doc or test looks like | `scripts/gen-sdk/` (`model.mjs` reads and validates the spec, `emit-code.mjs` the TypeScript, `emit-docs.mjs` api.md/README/examples/manifest). Then `pnpm run codegen`, review the golden diff with `pnpm --filter @productcraft/gen-fixture exec vitest run -u`, and add a fixture case to `packages/gen-fixture/fixture.openapi.json` for any new rule. |
| Change retries, auth headers, errors, pagination, polling or webhook verification | `packages/core/src/` (`client.ts`, `errors.ts`, `pagination.ts`, `webhooks.ts`; 0.x helpers in `legacy.ts`) |
| Switch a package to the generator | Add it to `SURFACES` in `scripts/gen-sdk.mjs`, reduce its `src/index.ts` to re-exports (mirror `packages/gen-fixture/src/`), add the `./testing` export, tsup `testing` entry and `__PC_SDK_VERSION__` define (mirror `packages/gen-fixture/package.json` and `tsup.config.ts`), add `<!-- generated:start -->` markers to its README, `pnpm run codegen`, `pnpm run build`, `pnpm run api-report`. |
| Add a new API surface (rare) | New package under `packages/<name>/` mirroring `packages/gen-fixture/` (but public, `version: 0.0.0` so a `minor` changeset lands `0.1.0`). Add the surface to `PC_BASE_URL` in `packages/core/src/legacy.ts`, `scripts/refresh-specs.sh`, `SURFACES`, and the umbrella. Configure its npm trusted publisher before the first release (below). |

## Checks (all in `ci.yml`)

| Check | Command | Fixes |
|---|---|---|
| Checked-in generator output is current | `pnpm run codegen && git diff --exit-code` | commit the regenerated api.md / README / examples |
| Determinism | `node scripts/gen-sdk.mjs --check` | remove whatever made output depend on order, time or paths |
| Hand-written allowlist | `node scripts/check-handwritten.mjs` | generate the file, or add it to the allowlist with a reason |
| Generator goldens, failure cases, per-op test, type rules | `pnpm --filter @productcraft/gen-fixture run test` | `vitest run -u` after an intended change |
| Snippets | `node scripts/check-snippets.mjs` (after build) | fix the block; old-version shapes go in ` ```ts before ` fences |
| Type resolution (CJS `.d.cts`, node10 `/testing`) | `node scripts/check-types-resolution.mjs` (after build) | nested `import`/`require` `types` in `exports`, `typesVersions` for subpaths, no ESM-only dependency types in public declarations |
| Public API reports | `node scripts/api-report.mjs` (after build) | review, then `pnpm run api-report` and commit `packages/*/api-report.md` |

## CI workflows

- `ci.yml` — install, codegen, the checks above, lint, build, test, dist smoke and size budget on every PR + push to main.
- `spec-refresh.yml` — nightly cron + manual dispatch. Fetches latest `/docs-json` from each prod API, runs codegen, build and `api-report --update`, emits a Changesets entry **per surface that changed**, and opens a PR. It labels the PR `breaking` when `oasdiff breaking` (pinned 1.34.1, checksum-verified) flags a spec change or an API report loses lines. Merging the PR triggers `release.yml` which then opens a "Version Packages" PR with just the right bumps. `scripts/refresh-specs.sh` fails the run (and keeps the old file) when an API's `/docs-json` is unreachable or isn't an OpenAPI document.
- **CI on bot PRs.** Pushes made with `GITHUB_TOKEN` don't start CI that runs, so `spec-refresh.yml` and `release.yml` use the SDK bot App token when `vars.SDK_BOT_APP_ID` + `secrets.SDK_BOT_PRIVATE_KEY` are set, and otherwise dispatch `ci.yml` (`workflow_dispatch`) on `chore/refresh-specs` / `changeset-release/main`. A dispatched run reports the commit status `CI / build-and-test (dispatched)` on the PR head (PR check rollups ignore dispatch check suites). Either way the bot PR shows a CI check: merge it only on green. If a run sits in `action_required`, approve it with `gh api -X POST repos/clauderanelagh/productcraft-node/actions/runs/<id>/approve`.
- `release.yml` — fires on every push to main. Uses [`changesets/action@v1`](https://github.com/changesets/action). Two modes:
   1. If `.changeset/*.md` files exist → opens / updates a "Version Packages" PR.
   2. If there are no pending changesets but `package.json` versions are ahead of npm → runs `pnpm run release` (build + `changeset publish`).

  **Publish auth — read this before touching release.yml.** Publishing is tokenless **npm trusted publishing (OIDC)**, bound to the workflow filename `release.yml` (restored 2026-10-23). Every published name has a trusted publisher for `clauderanelagh/productcraft-node` + `release.yml`; there is no `NPM_TOKEN`. A one-off workflow with a different filename cannot publish. `npm@11` is pinned deliberately — `npm@12` breaks provenance publishes with a missing-`sigstore` error.

  **Snapshot previews (`next`):** `gh workflow run release.yml --ref main -f snapshot=next` versions the pending changesets as `<version>-next-<datetime>` in the runner and publishes them under the `next` dist-tag; `latest` does not move. Use it to preview a major before it ships stable.

  **First publish of a brand-new package name:** configure its trusted publisher on npmjs.com (owner `clauderanelagh`, repo `productcraft-node`, workflow `release.yml`) BEFORE merging the Version Packages PR, or the publish 404s. Confirm it actually landed on npm after release, don't assume.

## Versioning

SemVer, **per package**, independent. Every published package is at 1.x or later since task 012 (2026-11-07). The `productcraft` umbrella picks up a patch bump whenever any of its surface deps bump (via `updateInternalDependencies: "patch"` in `.changeset/config.json`). A package that only *peer*-depends on another (auth-passport on auth) is bumped only when the new version leaves its peer range (`onlyUpdatePeerDependentsWhenOutOfRange`): without it, changesets made auth-passport 2.0.0 out of auth 1.1.0 on 2026-11-07, with no code change.

After 1.0 (`docs/sdk-standard.md` section 7):
- **minor** for additive changes, including a spec refresh that only adds operations, optional fields or enum values (the common churn). `spec-refresh.yml` writes these as `minor` per changed surface.
- **major** when `oasdiff breaking` on `Specs/` or a lost line in a package's `api-report.md` flags a break. `spec-refresh.yml` labels such a PR `breaking`: change its changeset to `major` and write `docs/migrations/<package>-<version>.md` (before/after for every call shape our docs and consumers use, old shapes in ` ```ts before ` fences) linked from the changeset text and the package README, before merging.
- **patch** for fixes that change no public type or call shape.
- Auth's deprecated 0.x aliases (`packages/auth/compat.json`) and `.client` on every product stay for all of 1.x; removing them is a 2.0.

The SDK version is **not** lock-stepped to the platform API version.

To add a manual version-bump for non-spec changes:
```bash
pnpm changeset       # interactive: pick packages + bump type
```

## Don't

- Don't commit `packages/*/src/_generated.d.ts`, `packages/*/src/_generated/`, `packages/*/tests/_generated/` or `packages/*/dist/`.
- Don't hand-edit `Specs/<surface>.json` — overwritten by `scripts/refresh-specs.sh`.
- Don't import directly from `_generated.d.ts` in user-facing code paths — go through the per-surface class so the abstraction stays consistent.
- The toolchain is **pinned exactly** in the root `package.json` (`openapi-typescript`, `openapi-fetch`, `tsup`, `typescript`, `@microsoft/api-extractor`): a bump is its own PR whose API report and golden diffs show any change. Packages' runtime dependency on `openapi-fetch` stays a caret range for consumers.
- Don't add packages outside `packages/` — the workspace glob (`pnpm-workspace.yaml`) only picks up that dir.

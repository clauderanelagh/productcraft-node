# 015 — `@productcraft/flags`: generated management client + `FlagsClient`

| Field | Value |
|---|---|
| Title | Flags SDK: management API on the generator and the local-evaluation client |
| Status | pending |
| Priority | high (Flags program, step 15 of 26) |
| Dependencies | 014 published; monorepo `tasks/flags-api/010` deployed (SDK-grade spec live at `api.flags.productcraft.co`) |
| Summary | Add the Flags surface to the generator and ship the hand-written `FlagsClient` (polling, ETag, cache, overrides, hooks, fail-safe) over `@productcraft/flags-engine`. |

## Context

- Design 8.1–8.2 (`monorepo/internal_docs/flags/design.md`), 6 (delivery endpoint behaviour the client relies on), PRD stories 2, 10, 11, 12.
- Research checklist section L: `packages/gen-fixture/` as the template, `SURFACES`, `refresh-specs.sh`, `codegen.sh`, `PC_BASE_URL.flags`, umbrella, size budget, live smoke, workflows lists, README tables, api-report.
- Core needs `runtimeTag`, `isBrowser`, `sleep` exported from `packages/core/src/client.ts` (core minor in this PR).

## Requirements

- `packages/flags` public (`0.0.0` → minor 0.1.0), `SURFACES.flags` (`className: 'Flags'`, `baseUrlKey`, `docsUrl: https://productcraft.co/docs/flags`, `webhookSecretEnv: PRODUCTCRAFT_FLAGS_WEBHOOK_SECRET`), `Specs/flags.json` via `refresh-specs.sh` only, `./testing` export, generated README region, examples, api.md.
- Hand-written `src/client/**` (allowlisted in 014): `FlagsClient` with the options and methods of design 8.2, including (2026-11-08 reviews, design 18) `defaultUser` / `setDefaultUser`, `getJson<T>`, json `getValue` returning the parsed value for object/array/null defaults, `null` defaults for every type, overrides from `values`, `file` (Node-only, optional watch) or `env` (`PRODUCTCRAFT_FLAGS_OVERRIDES`), the user shape of design 7.2, a 2 MiB response cap before parsing, strict `base_urls` validation (https, `*.productcraft.co`, no userinfo), and the `generation` rule; auto (60 s default, 30 s minimum clamp + warning, ±10% jitter, `maxInitWaitSeconds` 5), lazy (TTL ≥ 30 s, stale-while-refresh), manual; ETag reuse; never regress `revision`; 404 → keep cache, state `key_invalid`; backoff with `backoffMs` capped at 4× interval; `Retry-After`; `delivery.base_urls` failover restricted to `https://*.productcraft.co`; pluggable cache read at init; bootstrap; overrides (`local_only`, `local_over_remote`, `remote_over_local`); offline/online; hooks `ready`, `configChanged`, `evaluated`, `error`; `snapshot()`; `close()` clears timers (no open handles in tests); `getValue` never throws after construction; key format check → `ConfigurationError`.
- `src/index.ts` ≤ 60 lines: re-exports of the generated `Flags`, `FlagsClient`, engine types. Structure `src/client/**` so the Node-only parts (file overrides, `process.env`) sit behind one module that 017's browser entry swaps out.
- `./testing`: `createTestClient({ values, user? })` (design 8.2): `local_only`, no network, no timers, `set(key, value)` emits `configChanged`; documented in the README with a Vitest/Jest example.
- `examples/configcat-dual-run.mjs` (design 3.9, T22): evaluates N synthetic users (and an optional local JSON file of users) with ConfigCat's official Node SDK and `FlagsClient` side by side and prints every difference; `configcat-node` is a dependency of the example only (`examples/package.json`), never of the package. Test it in CI against a bootstrap Flags config and a ConfigCat config fixture (offline, ConfigCat SDK in local-only override mode).
- README sections: serverless (lazy polling + Redis cache + `bootstrap`), propagation time, NFC for emails, the server-vs-client config note.
- Umbrella `pc.flags` (management client), its tests; `PC_BASE_URL.flags`; `scripts/size-budget.json` entry `new FlagsClient({sdkKey}).getValue('k', false)` ≤ 10 KB gzip; `spec-refresh.yml` host list; `release.yml` comment list.
- `scripts/live/flags.mjs`: testing-environment only, throwaway `sdk-smoke-<ts>` project via `Flags`, read a flag with `FlagsClient`, toggle, `forceRefresh`, assert the flip, rotate nothing, delete the project in `finally` (sweep stale `sdk-smoke-` projects first). ≤ 5 req/s.
- Trusted publisher for `@productcraft/flags` configured before the Version Packages merge.

## Testing

Engine vectors through `FlagsClient` (bootstrap mode), client transcripts (`client[]` vectors) against core's mock server: 304 reuse, revision regression ignored, generation change accepted, 404 keeps cache, Retry-After honoured, 2 MiB cap, bad `base_urls` dropped, init timeout, offline, overrides precedence (values, file, env), cache read at init, `defaultUser`, `getJson`, null defaults, `createTestClient`; generated per-op tests; dist smoke ESM + CJS on Node 20.3/20/22/24; `check-dts`; snippets; api-report.

## Definition of Done

- [ ] CI green; merged; Version Packages merged on green; `@productcraft/flags` on npm; live smoke passes against prod (testing-environment) and its project is gone.
- [ ] This file deleted in the PR.

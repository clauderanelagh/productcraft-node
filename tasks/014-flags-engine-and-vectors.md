# 014 — `@productcraft/flags-engine`: evaluation engine, spec and test vectors

| Field | Value |
|---|---|
| Title | Flags evaluation engine package with the canonical spec and vectors |
| Status | pending |
| Priority | high (Flags program, step 10 of 23) |
| Dependencies | none to start (the spec is fixed in the monorepo design); add the renderer fixtures from monorepo `tasks/flags-api/006` once merged |
| Summary | Ship the pure, synchronous evaluation engine every Flags consumer uses (the SDK, the OpenFeature provider, and flags-api for validation and test evaluation), with its written spec, JSON Schema and golden vectors, and amend the SDK standard for hand-written local-evaluation code. |

## Context

- Contract: `monorepo/internal_docs/flags/design.md` sections 5 (config JSON schema 1), 7 (outcomes, algorithm, comparators, coercion, hashing, details, vector format), 8.1 (package split), T1, T11, T13, T16. Read those sections (about 150 lines), not the whole file.
- Research seed: the worked vectors file (hash values computed with Python `hashlib`, 2026-11-08) is reproduced in design 7.4/7.6; recompute every expectation in this PR, never trust a copied number.
- ConfigCat's evaluator (`configcat/common-js` `RolloutEvaluator.ts`) for the semantics we deliberately match: SHA-1 bucket `[0:7] % 100`, confidential `sha256(utf8(v)+salt+context)`, `"<n>_<hex>"` starts/ends, `""` = missing, number parse replaces the first `,`.
- Standard: `docs/sdk-standard.md` sections 6 and 13; `scripts/handwritten-allowlist.json`; `check-types-resolution`; size budget.

## Requirements

- New public package `packages/flags-engine` (`version: 0.0.0`, minor changeset → 0.1.0), zero runtime dependencies, ESM + CJS, nested `types` per condition, no I/O, no timers, no `node:` imports.
- API: `parseConfig(input: string | object): ParsedConfig` (throws `ConfigParseError` with code `PARSE_ERROR` / `UNSUPPORTED_SCHEMA`), `evaluate(config, key, defaultValue, user?) → EvaluationDetails`, `evaluateAll(config, user?)`, `bucket(seed, value)`, `hashConfidential(value, salt, context, slice?)`; types `User`, `EvaluationDetails`, `Reason`, `ErrorCode`, `Warning`.
- Pure-TS SHA-1 and SHA-256 (tested against `node:crypto` over random inputs incl. multibyte UTF-8), so evaluation is synchronous on every runtime.
- `SPEC.md` (normative text of design 7), `schema/config.schema.json` (schema 1), `vectors/*.json` (format 1) shipped in the npm package (`files`).
- Vector coverage per design 7.6 (every comparator positive and negated; soft misses; each coercion row; semver prerelease ordering; multibyte hashed starts/ends; segment with missing attribute; prerequisite chain/cycle/depth; buckets 0 and 99; 0% and 100% options; missing percentage attribute at rule and flag level; seed ≠ key; type mismatch; unknown key; unknown comparator; invalid configs).
- Standard amendment: `docs/sdk-standard.md` section 6 gains a row "Flags local evaluation (`packages/flags-engine/src/**`, `packages/flags/src/client/**`, `packages/flags-openfeature/**`): evaluation, polling and caching run in the customer's process, not over HTTP"; decision-log entry; allowlist entries with reasons; `CLAUDE.md` package table; root README table.
- Size budget: `evaluate()` import ≤ 6 KB gzip.
- npm trusted publisher for `@productcraft/flags-engine` configured BEFORE merging the Version Packages PR; confirm the publish landed.

## Out of Scope

Network client (015), OpenFeature (016).

## Testing

Vitest: vectors runner (all suites, hash tables, invalid configs), hash implementations vs `node:crypto`, property test (bucket in [0, 99], determinism), CJS and ESM dist smoke, `check-types-resolution`, size budget.

## Definition of Done

- [ ] CI green on the PR; merged; Version Packages PR merged on green; `npm view @productcraft/flags-engine version` shows 0.1.0.
- [ ] This file deleted in the PR.

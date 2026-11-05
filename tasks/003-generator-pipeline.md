# 003 — Generator pipeline (deterministic, CI-checked, docs included)

**Status:** pending
**Priority:** 3
**Dependencies:** 002. Built and tested against a fixture spec; it does not wait for any deployed API (the first real surface is 004).

## Summary

`scripts/gen-sdk.mjs` turns `Specs/<surface>.json` into `packages/<surface>/src/_generated/` (paths.d.ts, resources.ts, types.ts, webhooks.ts, errors.ts, testing.ts, manifest.json) plus the checked-in `api.md`, README generated region and `examples/`. It runs only for packages switched to it (a list in the script); the others keep the old `openapi-typescript` path until their task. kubb stays only until 009. This task also absorbs the former 011: every doc artefact is the generator's output.

## Context

- `docs/sdk-standard.md` sections 3 (naming, types, reserved names), 5 (generator rules), 6 (allowlist), 8 (docs outputs), 10 (CI).
- Prototype: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/proto/inhouse/gen.mjs` (derives names from dotted operationIds; switch it to `x-pc-sdk`). Budget 1,500 to 2,000 lines including templates.

## Requirements

- Names, scope binding, pagination, polling, `public` and exclusions read only from `x-pc-sdk`; type names from `x-pc-sdk-model`. Missing extension, collision, reserved-name clash (section 3.5), unresolved `$ref`, or `Record<string, never>` in a request body exits non-zero naming the operation.
- Types per section 3.4: string-literal unions (no `--enum`; `--enum-values` for value arrays), open response enums, `UnknownWebhookEvent`, defaults optional in requests and required in responses (golden-tested; post-process if no flag expresses it), the product type namespace (`Mail.Domain`, `Mail.DomainCreateParams`).
- Non-JSON success content types generate methods returning `Response`.
- Lazy resource getters; JSDoc on every method (summary, description, `@param`, `@throws`, `@see`, `@deprecated`, `@example` incl. the options-only `list({}, { timeout })` shape).
- Social `.as(actorId)` support: ops whose body or query declares `actor_id` are marked in the generated metadata so the bound scope can fill it.
- Generated `testing.ts` exporting `createMockFetch()` from spec examples, exposed as the `@productcraft/<p>/testing` subpath.
- Generated per-op test: for every manifest entry, call the method with spec example values against a mock fetch and assert method, path, query, bound params and Idempotency-Key presence.
- Determinism: codegen twice and diff; committed `api.md`, README region and `examples/` must equal fresh output.
- `scripts/check-snippets.mjs`: typechecks every TS block in READMEs, `api.md`, `docs/` and `examples/` against the built packages; skips ` ```ts before ` blocks and `docs/sdk-standard.md` (illustrative).
- `scripts/handwritten-allowlist.json` + CI check (unlisted hand-written files under `packages/*/src` fail; `index.ts` at most 60 lines).
- `api-extractor` report per package (`packages/<p>/api-report.md`) committed and diffed in CI.
- Toolchain pinned exactly (openapi-typescript, openapi-fetch, tsup, typescript, api-extractor); `oasdiff breaking` added to spec-refresh to set the `breaking` label.
- Golden-file tests on a fixture spec covering every rule in section 3.2 (including segment methods, `export`, `update<Field>`, id-less DELETE failing), binds, pagination, polling, public ops, idempotent ops, non-JSON, webhooks and the failure cases.
- `pnpm run codegen` stays the single entry point; CLAUDE.md "maintenance contract", "Where to make changes" and the "don't pin" line rewritten for the new pipeline.
- Changeset: none needed for packages unless a package's published output changes (it should not).

## Out of Scope

- Switching any product package's public surface (004 onward).

## Testing

- Fixture golden tests; determinism diff; snippet check on the existing READMEs (expected to flag the 8 known-stale examples; mark them ` ```ts before ` or fix them in the product tasks).

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

# 003 — Generator pipeline (deterministic, CI-checked)

**Status:** pending
**Priority:** 3
**Dependencies:** 002; monorepo tasks 021 and 022 deployed on at least Trawl (so `x-pc-sdk` and `x-webhooks` exist in one vendored spec)

## Summary

`scripts/gen-sdk.mjs` turns `Specs/<surface>.json` into `packages/<surface>/src/_generated/` (paths.d.ts, resources.ts, types.ts, webhooks.ts, errors.ts, manifest.json, api.md, README generated region, examples). It replaces `scripts/codegen.sh`'s two code paths with one, for every surface. kubb stays only until 009 moves Auth over.

## Context

- `docs/sdk-standard.md` sections 3 (naming from `x-pc-sdk`), 5 (generator rules) and 8 (docs outputs).
- Prototype: `/mnt/HC_Volume_105482467/work/sdk-dx-2026-11/proto/inhouse/gen.mjs` (derives names from dotted operationIds; switch it to `x-pc-sdk`).
- openapi-typescript flags: `--default-non-nullable false --empty-objects-unknown --enum --export-type` (fixes Trawl `max_steps` becoming required and `Record<string, never>` fields).

## Requirements

- Names, scope binding, pagination and exclusions read only from `x-pc-sdk`. Missing extension, collision, unresolved `$ref`, or `Record<string, never>` in a request body exits non-zero naming the operation.
- Resource classes instantiate lazily (getter + cache) so unused namespaces tree-shake.
- JSDoc on every method: summary, description, path-arg `@param`, `@throws` per documented status, `@see` route + docs URL, `@deprecated`.
- Determinism: CI runs codegen twice and diffs; committed `api.md`, README region and `examples/` must equal fresh output.
- `scripts/check-snippets.mjs`: typechecks every TS code block in READMEs, `api.md`, `docs/` and `examples/` against the built packages; wired into `ci.yml`.
- Golden-file tests on a small fixture spec covering every naming rule in section 3.2, binds, pagination, idempotent ops, webhooks and the failure cases.
- `pnpm run codegen` stays the single entry point; CLAUDE.md "maintenance contract" and "Where to make changes" rewritten for the new pipeline (new surfaces mirror any non-auth package; no hand-written wrappers per endpoint).

## Out of Scope

- Switching any product package's public surface (004 onward).

## Testing

- Fixture golden tests; determinism diff; snippet check on the existing READMEs (expected to flag the 8 known-stale examples; fix them or mark them in the product tasks).

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

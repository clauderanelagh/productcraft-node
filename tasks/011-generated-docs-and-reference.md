# 011 — Generated READMEs, api.md, examples and the manifest

**Status:** pending
**Priority:** 11
**Dependencies:** 010

## Summary

Finish section 8 of `docs/sdk-standard.md`: every package ships a README whose generated region covers resources, pagination, errors, retries, idempotency, webhooks, raw responses and `.client`; a full `api.md`; runnable `examples/`; and `manifest.json` (operationId to resource, method, signature, snippet) inside the npm tarball for the productcraft.co reference renderer.

## Context

- Generator outputs from 003; consumer of the manifest: monorepo `tasks/productcraft-co/227`.
- Package `homepage` links to productcraft.co/docs/<product> (PR #88); README links must be absolute (relative ones 404 on npmjs.com).

## Requirements

- Hand-written intro block per README (install, construct, three headline calls) outside the generated markers.
- `files` in each package.json includes `manifest.json` and `api.md`; `npm pack --dry-run` shows them.
- Examples use spec `example` values; every snippet passes `check-snippets` in CI.
- Root README rewritten around the new surface with links to each package and `docs/sdk-standard.md`.

## Testing

- Snippet check, determinism diff, `npm pack --dry-run` assertions in CI.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

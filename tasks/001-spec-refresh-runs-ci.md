# 001 — Spec refresh PRs run CI, and the vendored specs catch up

**Status:** pending
**Priority:** 1
**Dependencies:** none

## Summary

The nightly `spec-refresh.yml` pushes with `GITHUB_TOKEN`, so its PRs never trigger CI (#95 has been open since 2026-10-25 with no checks) and the vendored `Specs/` are about 12 days behind live (mail: 109 ops vendored, 155 live). Fix the trigger, land the backlog, and make every later task in this program start from fresh specs.

## Context

- `.github/workflows/spec-refresh.yml`, `scripts/refresh-specs.sh`, open PR #95.
- `docs/sdk-standard.md` section 10.
- Bot PR runs can also sit in `action_required` (fork-PR approval policy); approve with `gh api -X POST repos/clauderanelagh/productcraft-node/actions/runs/<id>/approve`.

## Requirements

- spec-refresh pushes with a token that triggers workflows (GitHub App installation token preferred, otherwise a fine-grained PAT scoped to this repo stored as a repo secret; record its expiry in the workflow comment), or dispatches `ci.yml` explicitly with `workflow_dispatch` on the PR head.
- #95 closed or rebased onto current specs; current live specs merged with one changeset per changed surface (patch).
- The refresh job fails loudly when an API's `/docs-json` is unreachable instead of keeping the stale file silently.

## Testing

- Manually dispatch spec-refresh; the resulting PR shows CI checks.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

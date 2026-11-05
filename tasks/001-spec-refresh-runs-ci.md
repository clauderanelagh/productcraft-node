# 001 — Spec refresh and Version Packages PRs run CI; vendored specs catch up

**Status:** pending
**Priority:** 1
**Dependencies:** none (start now)

## Summary

The nightly `spec-refresh.yml` pushes with `GITHUB_TOKEN`, so its PRs never trigger CI (#95 has been open since 2026-10-25 with no checks) and the vendored `Specs/` are about 12 days behind live (mail: 109 ops vendored, 155 live). The changesets "Version Packages" PRs from `release.yml` have the same problem. Fix both triggers, land the backlog, and make every later task start from fresh specs.

## Context

- `.github/workflows/spec-refresh.yml`, `.github/workflows/release.yml`, `scripts/refresh-specs.sh`, open PR #95.
- `docs/sdk-standard.md` section 10.
- Bot PR runs can also sit in `action_required`; approve with `gh api -X POST repos/clauderanelagh/productcraft-node/actions/runs/<id>/approve`.
- `release.yml` is bound to the npm trusted publisher by filename: edit it in place, never rename or copy it.

## Requirements

- spec-refresh pushes with a token that triggers workflows (GitHub App installation token preferred, otherwise a fine-grained PAT scoped to this repo stored as a repo secret; record its expiry in the workflow comment).
- `release.yml`'s changesets action opens Version Packages PRs with the same token, so they get CI and "merge only on green" holds for them. Publishing stays OIDC (no npm token).
- #95 closed or rebased onto current specs; current live specs merged with one changeset per changed surface (patch, published as normal stable patches).
- The refresh job fails loudly when an API's `/docs-json` is unreachable instead of keeping the stale file silently.

## Testing

- Manually dispatch spec-refresh; the resulting PR shows CI checks. The next Version Packages PR shows CI checks.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing), Version Packages PR merged on green CI. Confirm the version on npm (`npm view`) after it publishes.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

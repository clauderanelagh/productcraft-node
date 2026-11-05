# 012 — Stable 1.0 / 2.0 release

**Status:** pending
**Priority:** 12
**Dependencies:** 011; monorepo console/086 and productcraft-co/227 verified against the `next` versions

## Summary

Exit changesets pre mode and publish the stable majors (core, mail, waitlist, trawl, platform-auth, auth, auth-passport, umbrella 1.0.0; social 2.0.0) through `release.yml`, then move the monorepo consumers from `next` to the stable pins.

## Context

- `docs/sdk-standard.md` section 7; CLAUDE.md release flow; memory `reference_npm_publish_trusted_publishing.md` (registry lag 1-4 min; manual publish only as that memory's documented fallback, and say so if used).

## Requirements

- `pnpm changeset pre exit`; Version Packages PR green and merged; every version confirmed on npm with `npm view` and the `latest` dist-tag.
- Clean-install ESM and CJS smoke of each published package from a scratch dir under `/mnt/HC_Volume_105482467/work/`.
- Changeset texts link each migration guide.
- Monorepo follow-up PR bumps productcraft-co (Workbench pins, docs) and libs/fe-client-lib to the stable versions, gated and deployed per `~/.claude/workflow-state/mono-common.md`.
- Repo CLAUDE.md "Versioning" updated for post-1.0 rules (minor for additive spec refreshes, major when manifest.json loses or renames anything; spec-refresh labels it).
- Optional follow-up notes (not changes) for conquer-services, WriteWave, dispute.markets, pointing at the migration guides.

## Testing

- Published-package smoke; live productcraft.co docs page and Workbench typecheck against the stable pins.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Changeset added with the bump this task names; release only through `release.yml` (trusted publishing). Confirm the version on npm after the Version Packages PR merges.
- [ ] `docs/sdk-standard.md` updated if the task changed a decision

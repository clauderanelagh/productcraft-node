# 012 — Auth 1.0 stable, core and umbrella 1.0, consumer pins

**Status:** pending
**Priority:** 12
**Dependencies:** 010; monorepo console/086 and productcraft-co/228 verified (Auth parts against the `next` snapshot)

## Summary

The products shipped stable in 004-008. This task publishes the rest as stable majors through `release.yml`: `@productcraft/auth` 1.0.0, `@productcraft/auth-passport` 1.0.0, `@productcraft/core` 1.0.0 and `productcraft` 1.0.0. It moves the monorepo consumers to the stable pins and rewrites the root README (former task 011's remainder).

## Context

- `docs/sdk-standard.md` section 7; CLAUDE.md release flow; memory `reference_npm_publish_trusted_publishing.md` (registry lag 1-4 min; manual publish only as that memory's documented fallback, and say so if used).
- There is no pre mode to exit: Auth's previews were snapshots.

## Requirements

- Changesets: `major` for auth, auth-passport, core and productcraft. Version Packages PR green and merged; every version confirmed on npm with `npm view` and the `latest` dist-tag.
- Clean-install ESM and CJS smoke of each published package from a scratch dir under `/mnt/HC_Volume_105482467/work/`, on Node 20 and 22.
- Changeset texts link each migration guide.
- Root README rewritten around the new surface with links to each package, `api.md` and `docs/sdk-standard.md` (absolute links; relative ones 404 on npmjs.com).
- Monorepo follow-up PR bumps productcraft-co (Workbench pins, docs typecheck) and libs/fe-client-lib to the stable versions, gated and deployed per `~/.claude/workflow-state/mono-common.md`.
- Repo CLAUDE.md "Versioning" updated for post-1.0 rules (minor for additive spec refreshes, major on `oasdiff breaking` or a breaking API report diff; spec-refresh labels it).
- conquer-services and WriteWave stay on their pins (standard section 11); no changes there.

## Testing

- Published-package smoke; live productcraft.co docs page and Workbench typecheck against the stable pins.

## Definition of Done

- [ ] `pnpm run codegen && pnpm run lint && pnpm run build && pnpm run test` green locally (under `flock /tmp/claude-heavy.lock choom -n 1000 --`)
- [ ] PR CI green (`gh pr checks`), then squash-merged; this file deleted in the same PR
- [ ] Release only through `release.yml` (trusted publishing); versions confirmed on npm
- [ ] `docs/sdk-standard.md` status line updated to "program complete"

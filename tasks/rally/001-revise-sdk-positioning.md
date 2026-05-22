# 001 — Revise `@productcraft/rally` positioning + examples

**Status:** pending
**Priority:** 1
**Dependencies:** none

## Summary

Audit the Rally SDK package for correctness: the README, `package.json` description, the umbrella's reference to it, and the example endpoints in the README and on the productcraft.co SDKs page (`/docs/sdks`). The heimdall@0.1.0 release shipped the other SDKs alongside it; the Rally README was authored by guessing the surface from the OpenAPI spec + the docs landing page rather than walking the actual codebase, so the framing and examples may not match the product as customers actually use it.

## Context

- Package source: `packages/rally/`
- README to audit: `packages/rally/README.md`
- `package.json#description` to audit: `packages/rally/package.json`
- Umbrella description to audit: `packages/umbrella/README.md`
- On-site card to audit: `apps/productcraft-co/app/docs/sdks/page.tsx` in `~/repos/monorepo`
- Source of truth for what Rally is: `apps/rally-api/` in the monorepo, plus `internal_docs/rally/` (and the live OpenAPI spec at `https://api.rally.productcraft.co/docs-json`)
- Rally has a public entry endpoint (`POST /v1/waitlists/:workspace_slug/:waitlist_slug/entries`) that is *intentionally unauthenticated* so a marketing site form can post submissions directly. Make sure the README's quick-start covers that fact.
- The agora README hit a similar audit issue and was corrected. Same level of audit is warranted here.

## Requirements

- The `package.json#description` matches Rally's actual product framing.
- The README's quick-start example uses real endpoint paths + DTO field names that exist in the current OpenAPI spec (snake_case on the wire).
- The README clearly distinguishes the public-form path from the workspace-admin path.
- The umbrella README bullet for Rally matches.
- The `/docs/sdks` card on productcraft.co matches.
- If any positioning changes, run the changeset flow: `pnpm changeset` (`patch`) and let the release PR pick it up.

## Out of Scope

- Adding ergonomic resource wrappers. v0.1+ work.
- Touching the generated client.
- The on-site Rally guides — tracked separately in `monorepo/tasks/productcraft-co/002-rally-guides-sdk-toggle.md`.

## Affected Files

- `packages/rally/README.md`
- `packages/rally/package.json`
- `packages/umbrella/README.md`
- `apps/productcraft-co/app/docs/sdks/page.tsx` (separate repo)
- A new `.changeset/<slug>.md` if metadata changed

## Testing

- `pnpm run build` clean
- `pnpm run lint` clean
- `pnpm run test` clean
- Manual: `npm view @productcraft/rally description` reflects the new wording after release.

## Definition of Done

- [ ] All description surfaces match Rally's actual product framing.
- [ ] At least one quick-start example uses a real endpoint.
- [ ] A changeset (`patch`) is filed if metadata changed.
- [ ] `tasks/rally/001-revise-sdk-positioning.md` deleted in the same PR.

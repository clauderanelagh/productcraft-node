# 001 — Revise `@productcraft/platform-auth` positioning + examples

**Status:** pending
**Priority:** 1
**Dependencies:** none

## Summary

Audit the Platform-Auth SDK package for correctness: the README, `package.json` description, the umbrella's reference to it, and the example endpoints in the README and on the productcraft.co SDKs page (`/docs/sdks`). The heimdall@0.1.0 release shipped the other SDKs alongside it; the platform-auth README was authored by guessing the surface from the OpenAPI spec rather than walking the actual codebase.

## Context

- Package source: `packages/platform-auth/`
- README to audit: `packages/platform-auth/README.md`
- `package.json#description` to audit: `packages/platform-auth/package.json`
- Umbrella description to audit: `packages/umbrella/README.md`
- On-site card to audit: `apps/productcraft-co/app/docs/sdks/page.tsx` in `~/repos/monorepo`
- Source of truth: `apps/platform-auth-api/` in the monorepo (and the live OpenAPI spec at `https://api.auth.productcraft.co/docs-json`)
- Important distinction to surface clearly: platform-auth is the **platform-side** identity layer (PlatformUsers, workspaces, workspace API keys, workspace introspect). Customer-facing EndUser auth is `@productcraft/heimdall`. The two are easy to confuse — the README must make the choice obvious.

## Requirements

- The `package.json#description` matches Platform-Auth's actual product framing.
- The README's quick-start example uses real endpoint paths + DTO field names that exist in the current OpenAPI spec.
- A "use this instead of `@productcraft/heimdall` when…" note up top so the right SDK gets picked first.
- The umbrella README bullet for Platform-Auth matches.
- The `/docs/sdks` card on productcraft.co matches.
- If any positioning changes, run the changeset flow: `pnpm changeset` (`patch`).

## Out of Scope

- Adding ergonomic resource wrappers. v0.1+ work.
- Touching the generated client.
- The on-site Platform guides — tracked separately in `monorepo/tasks/productcraft-co/004-platform-auth-guides-sdk-toggle.md`.

## Affected Files

- `packages/platform-auth/README.md`
- `packages/platform-auth/package.json`
- `packages/umbrella/README.md`
- `apps/productcraft-co/app/docs/sdks/page.tsx` (separate repo)
- A new `.changeset/<slug>.md` if metadata changed

## Testing

- `pnpm run build` clean
- `pnpm run lint` clean
- `pnpm run test` clean
- Manual: `npm view @productcraft/platform-auth description` reflects the new wording after release.

## Definition of Done

- [ ] All description surfaces match Platform-Auth's actual product framing.
- [ ] At least one quick-start example uses a real endpoint.
- [ ] The Heimdall-vs-Platform-Auth distinction is clear at the top of the README.
- [ ] A changeset (`patch`) is filed if any metadata changed.
- [ ] `tasks/platform-auth/001-revise-sdk-positioning.md` deleted in the same PR.

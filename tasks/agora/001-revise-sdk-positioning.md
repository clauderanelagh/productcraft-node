# 001 — Revise `@productcraft/agora` positioning + examples

**Status:** pending
**Priority:** 1
**Dependencies:** none

## Summary

Audit the Agora SDK package for correctness: the README, `package.json` description, the umbrella's reference to it, and the example endpoints in the README and on the productcraft.co SDKs page (`/docs/sdks`). The 0.0.3 release shipped a README + description that wrongly framed Agora as a marketing-site / landing-page product. The high-level descriptions have been corrected in-place; this task verifies the rest (endpoint examples, quick-start, common-operations section) reflects the actual social-infrastructure product (communities, posts, feeds, stories, moderation).

## Context

- Package source: `packages/agora/`
- README to audit: `packages/agora/README.md`
- `package.json#description` to audit: `packages/agora/package.json` (already corrected in the v0.1.0 release follow-up — confirm it's still right)
- Umbrella description to audit: `packages/umbrella/README.md`
- On-site card to audit: `apps/productcraft-co/app/docs/sdks/page.tsx` in `~/repos/monorepo`
- Source of truth: `apps/agora-api/` in the monorepo, plus `internal_docs/agora/` (and the live OpenAPI spec at `https://agora.productcraft.co/docs-json`)
- Wire convention quirk: agora-api uses snake_case **both** in TS DTOs **and** on the wire — no name translation layer. Examples must use snake_case literally, no camelCase aliasing.

## Requirements

- The `package.json#description` matches Agora's actual product framing (social infra, not landing pages).
- The README's quick-start example uses real endpoint paths + DTO field names that exist in the current OpenAPI spec.
- The README's "Common operations" section covers what an Agora customer would actually do first (create a community, post, fetch feed, react, etc.).
- The umbrella README bullet for Agora matches.
- The `/docs/sdks` card on productcraft.co matches.
- If any positioning changes since the 0.0.3 release, run the changeset flow: `pnpm changeset` (`patch`).

## Out of Scope

- Adding ergonomic resource wrappers. v0.1+ work.
- Touching the generated client.
- The on-site Agora guides — tracked separately in `monorepo/tasks/productcraft-co/003-agora-guides-sdk-toggle.md`.

## Affected Files

- `packages/agora/README.md`
- `packages/agora/package.json`
- `packages/umbrella/README.md`
- `apps/productcraft-co/app/docs/sdks/page.tsx` (separate repo)
- A new `.changeset/<slug>.md` if metadata changed

## Testing

- `pnpm run build` clean
- `pnpm run lint` clean
- `pnpm run test` clean
- Manual: open https://www.npmjs.com/package/@productcraft/agora and confirm the rendered README + description match.

## Definition of Done

- [ ] All description surfaces match Agora's actual product framing.
- [ ] At least one quick-start example uses a real endpoint.
- [ ] A changeset (`patch`) is filed if any metadata changed.
- [ ] `tasks/agora/001-revise-sdk-positioning.md` deleted in the same PR.

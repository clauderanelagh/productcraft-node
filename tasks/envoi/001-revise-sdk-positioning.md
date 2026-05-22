# 001 — Revise `@productcraft/envoi` positioning + examples

**Status:** pending
**Priority:** 1
**Dependencies:** none

## Summary

Audit the Envoi SDK package for correctness: the README, `package.json` description, the umbrella's reference to it, and the example endpoints in the README and on the productcraft.co SDKs page (`/docs/sdks`). The heimdall@0.1.0 release shipped the other SDKs alongside it; the Envoi README was authored by guessing the surface from the OpenAPI spec + the docs landing page rather than walking the actual codebase, so the framing and examples may not match the product as customers actually use it.

## Context

- Package source: `packages/envoi/`
- README to audit: `packages/envoi/README.md`
- `package.json#description` to audit: `packages/envoi/package.json`
- Umbrella description to audit: `packages/umbrella/README.md` (the bullet list of surfaces near the top)
- On-site card to audit: `apps/productcraft-co/app/docs/sdks/page.tsx` (the entry whose `name === '@productcraft/envoi'`) — same file lives in `~/repos/monorepo`
- Source of truth for what Envoi is: `apps/mailbox-api/` in the monorepo, plus `internal_docs/envoi/` (and the live OpenAPI spec at `https://api.mail.productcraft.co/docs-json`)
- The agora README hit a similar issue and was corrected: agora was wrongly described as "landing pages, marketing sites, content blocks" when it's actually social infrastructure. Same level of audit is warranted here.

## Requirements

- The `package.json#description` matches Envoi's actual product framing (transactional email + DKIM + outbound webhooks etc.) — verify against `apps/mailbox-api/` controllers, not guesses.
- The README's quick-start example uses real endpoint paths + DTO field names that exist in the current OpenAPI spec (run `pnpm refresh-specs` + grep `Specs/envoi.json` if in doubt). Make sure path params use the same casing the spec emits (snake_case on the wire).
- The README's "Common operations" section covers the genuinely common operations (look at the spec's top-level paths and pick what a customer would actually do first).
- The umbrella README bullet for Envoi matches the new framing.
- The `/docs/sdks` card on productcraft.co matches.
- If any positioning changes, run the changeset flow: `pnpm changeset` (a `patch` bump is fine — README-only) and let the release PR pick it up.

## Out of Scope

- Adding ergonomic resource wrappers (`envoi.messages.send(...)`). That's a future v0.1+ task.
- Touching the generated client. The spec drives codegen; if the SDK is missing endpoints, refresh the spec instead of hand-editing.
- The on-site Envoi guides. Those are tracked separately in `monorepo/tasks/productcraft-co/001-envoi-guides-sdk-toggle.md`.

## Affected Files

- `packages/envoi/README.md`
- `packages/envoi/package.json`
- `packages/umbrella/README.md`
- `apps/productcraft-co/app/docs/sdks/page.tsx` (separate repo: `~/repos/monorepo`)
- A new `.changeset/<slug>.md` entry if the description changed

## Testing

- `pnpm run build` clean
- `pnpm run lint` clean (no warnings)
- `pnpm run test` clean
- Manual: `npm view @productcraft/envoi description` reflects the new wording after the release PR merges.

## Definition of Done

- [ ] All three description surfaces (package.json, README, umbrella, on-site card) match Envoi's actual product framing.
- [ ] At least one quick-start example in the README uses an endpoint that actually exists in the current OpenAPI spec.
- [ ] A changeset (`patch`) is filed if any package metadata changed.
- [ ] `tasks/envoi/001-revise-sdk-positioning.md` deleted in the same PR.

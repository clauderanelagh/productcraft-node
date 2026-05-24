# productcraft

## 0.0.7

### Patch Changes

- Updated dependencies [543300b]
  - @productcraft/heimdall@0.2.0

## 0.0.6

### Patch Changes

- ed0d60c: Full README audit + rewrite. The v0.0.3 README was a one-paragraph stub; expand to cover the actual API surface — authentication (sign-in / signup / refresh / logout / password reset / verification), introspect (used by every other ProductCraft backend to resolve permissions), workspaces, members + invites, roles, IAM policies + the action catalogue, workspace API keys + bindings, service activation, audit feeds. Adds a "Which SDK do I want?" table up top so callers don't confuse Platform-Auth (your ProductCraft team's account) with Heimdall (the end-users of products you build on top).
- Updated dependencies [ed0d60c]
  - @productcraft/platform-auth@0.0.4

## 0.0.5

### Patch Changes

- 3cbd97b: Full README audit against the live API: documents both caller contexts (PlatformUser admin on `/v1/workspaces/{workspaceId}/...` vs customer-backend on `/v1/communities/{communityId}/...` with the `X-Acting-As` header), expands the quick-start with a "post on behalf of an EndUser" example, and adds a Common-Operations section covering posts + feeds, stories, social graph, notifications, direct conversations, and moderation. Notes that Agora's wire is snake_case both at the DTO level and in TS types (no name translation layer for this surface).
- d8e5170: Rewrite the README + package.json description to match Envoi's actual surface — a receive-and-store mail platform with template-rendered sends, workspace-scoped mailboxes + domains + DKIM, message timeline, suppression lists, and outbound webhooks. The v0.0.3 README documented a fictional `POST /v1/mailboxes/{mailboxId}/messages/send` shape; the live endpoint is `POST /v1/workspaces/{workspace_id}/templates/{name}/send` and is template-rendered with idempotency support. Quick-start + common-operations section now line up with what the live OpenAPI spec actually accepts.
- 5c6f806: Rewrite the README + package.json description to match Rally's actual surface — waitlist management with public-form signups, variants for A/B/n landing pages, referrals, position + leaderboard, approval workflow with invite-to-app, signed outbound webhooks, and CSV export. Quick-start now correctly distinguishes the public unauthenticated submit endpoint from the workspace-admin path, includes the `recaptcha_token` field, and surfaces the variant/referral round-trip flow customers actually use.
- Updated dependencies [3cbd97b]
- Updated dependencies [d8e5170]
- Updated dependencies [5c6f806]
  - @productcraft/agora@0.0.5
  - @productcraft/envoi@0.0.4
  - @productcraft/rally@0.0.4

## 0.0.4

### Patch Changes

- ce35855: Fix the package description + README framing — Agora is social infrastructure (communities, posts, feeds, stories, moderation), not "landing pages / marketing sites / content blocks" as the v0.0.3 README mistakenly claimed.
- Updated dependencies [ce35855]
  - @productcraft/agora@0.0.4

## 0.0.3

### Patch Changes

- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [9cfa43f]
- Updated dependencies [52b6058]
  - @productcraft/agora@0.0.3
  - @productcraft/envoi@0.0.3
  - @productcraft/platform-auth@0.0.3
  - @productcraft/rally@0.0.3
  - @productcraft/heimdall@0.1.0
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2
  - @productcraft/agora@0.0.2
  - @productcraft/envoi@0.0.2
  - @productcraft/heimdall@0.0.2
  - @productcraft/platform-auth@0.0.2
  - @productcraft/rally@0.0.2

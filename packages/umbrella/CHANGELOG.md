# productcraft

## 0.2.5

### Patch Changes

- Updated dependencies [380f329]
  - @productcraft/social@0.6.0

## 0.2.4

### Patch Changes

- Updated dependencies [4688927]
- Updated dependencies [23adb6c]
- Updated dependencies [e7711bb]
- Updated dependencies [25494aa]
- Updated dependencies [a1b912e]
- Updated dependencies [01edb35]
- Updated dependencies [9c0ce88]
- Updated dependencies [590cfaa]
- Updated dependencies [e20766a]
- Updated dependencies [4688927]
- Updated dependencies [1d817c7]
- Updated dependencies [4afe599]
- Updated dependencies [1a255d6]
- Updated dependencies [86e54d2]
- Updated dependencies [eceee41]
  - @productcraft/social@0.5.0

## 0.2.3

### Patch Changes

- Updated dependencies [be3a774]
  - @productcraft/social@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [d761107]
  - @productcraft/social@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [ee0f176]
- Updated dependencies [ee0f176]
  - @productcraft/auth@0.5.2
  - @productcraft/trawl@0.1.1
  - @productcraft/social@0.2.0

## 0.2.0

### Minor Changes

- 2904862: Add `@productcraft/trawl` — typed client for the ProductCraft Trawl AI
  web-extraction API (jobs + webhooks). Also surfaced on the `productcraft`
  umbrella as `pc.trawl`, and `PC_BASE_URL.trawl` added to `@productcraft/core`.

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/trawl@0.1.0
  - @productcraft/core@0.2.0
  - @productcraft/auth@0.5.1
  - @productcraft/mail@0.1.1
  - @productcraft/platform-auth@0.0.12
  - @productcraft/social@0.1.1
  - @productcraft/waitlist@0.1.1

## 0.1.0

### Minor Changes

- f49319c: Rename the per-product packages to the rebranded product names — the
  final step of the ProductCraft rebrand (Heimdall→Auth, Envoi→Mail,
  Rally→Waitlist, Agora→Social):
  - `@productcraft/heimdall` → `@productcraft/auth` (class `Heimdall` → `Auth`)
  - `@productcraft/heimdall-passport` → `@productcraft/auth-passport`
    (`createHeimdallJwtStrategy` → `createAuthJwtStrategy`)
  - `@productcraft/envoi` → `@productcraft/mail` (class `Envoi` → `Mail`)
  - `@productcraft/rally` → `@productcraft/waitlist` (class `Rally` → `Waitlist`)
  - `@productcraft/agora` → `@productcraft/social` (class `Agora` → `Social`)
  - `@productcraft/core`: `PC_BASE_URL` keys renamed to match
    (`heimdall`→`auth`, `envoi`→`mail`, `rally`→`waitlist`, `agora`→`social`)
  - `productcraft` umbrella: accessors renamed (`pc.auth`, `pc.mail`,
    `pc.waitlist`, `pc.social`); per-surface config overrides moved under
    a nested `overrides` key because the Auth surface's flat `auth` key
    would collide with the shared `auth` credential field.

  Wire contracts are unchanged: the legacy consumer JWT issuer literal
  stays `"heimdall"` (exported as `AUTH_LEGACY_ISSUER`), `pcft:heimdall:` /
  `pcft:envoi:` resource URNs, `ENVOI_*` error codes, and all old hosts
  keep working. The old npm package names remain published and receive a
  deprecation notice pointing here.

### Patch Changes

- Updated dependencies [f49319c]
  - @productcraft/auth@0.5.0
  - @productcraft/mail@0.1.0
  - @productcraft/waitlist@0.1.0
  - @productcraft/social@0.1.0
  - @productcraft/core@0.1.0
  - @productcraft/platform-auth@0.0.11

## 0.0.14

### Patch Changes

- Updated dependencies [ffab086]
  - @productcraft/heimdall@0.4.1
  - @productcraft/envoi@0.0.9
  - @productcraft/agora@0.0.11
  - @productcraft/rally@0.0.10
  - @productcraft/platform-auth@0.0.10

## 0.0.13

### Patch Changes

- Updated dependencies [3f9c383]
  - @productcraft/heimdall@0.4.0
  - @productcraft/envoi@0.0.8
  - @productcraft/rally@0.0.9
  - @productcraft/agora@0.0.10
  - @productcraft/platform-auth@0.0.9

## 0.0.12

### Patch Changes

- Updated dependencies [91e0664]
  - @productcraft/heimdall@0.3.3
  - @productcraft/agora@0.0.9
  - @productcraft/rally@0.0.8
  - @productcraft/platform-auth@0.0.8

## 0.0.11

### Patch Changes

- Updated dependencies [734798c]
  - @productcraft/core@0.0.5
  - @productcraft/agora@0.0.8
  - @productcraft/envoi@0.0.7
  - @productcraft/heimdall@0.3.2
  - @productcraft/platform-auth@0.0.7
  - @productcraft/rally@0.0.7

## 0.0.10

### Patch Changes

- Updated dependencies [d18aa84]
  - @productcraft/core@0.0.4
  - @productcraft/agora@0.0.7
  - @productcraft/envoi@0.0.6
  - @productcraft/heimdall@0.3.1
  - @productcraft/platform-auth@0.0.6
  - @productcraft/rally@0.0.6

## 0.0.9

### Patch Changes

- Updated dependencies [2b1e14e]
- Updated dependencies [7d797b4]
  - @productcraft/heimdall@0.3.0

## 0.0.8

### Patch Changes

- a757470: README truth pass against the live API.

  Verified end-to-end on prod (2026-05-25) during an SDK shakedown. Six READMEs had request/response shapes the API rejects when copy-pasted:
  - **platform-auth** — Quickstart claimed `data.policy.statements[…]` + `data.enabled_services[…]`; real wire is flat `data.policy: PolicyStatement[]` + `data.services: string[]`. `/v1/introspect/api-key` is **POST**, not GET. Workspace create body is `display_name`, not `name`. PAT mint requires `policy_ids: [<uuid>]` referencing pre-authored `workspace_policy` rows — not an inline `policy: [...]`. Added an auth-mode table explaining which surfaces accept PAK vs. require human session.
  - **heimdall** — Removed non-existent `heimdall.idp.list()`. Fixed `apps.create` to `{ display_name, slug, workspace_id }` (was `{ name, slug }`). Fixed `app.endUsers.update` to `{ display_name?, email? }` and added the separate `updateStatus` call. Roles are two-step: `create({ name })` then `setPermissions(roleName, { permissions })` — the SDK type doesn't carry `permissions` on create. Added required `permissions: []` to `apiKeys.create`. Consumer signup body is `{ email, password, username, display_name? }`, not `{ identifier, password }`. Password reset body is `{ token, new_password }`. Auth-config update uses flat camelCase fields (`passwordMinLength: 12`), not nested `{ passwordPolicy: { ... } }`.
  - **envoi** — Template lint body is `body_html` (wire) / `bodyHtml` (camelCase DTO), not `html`.
  - **rally** — Waitlist create body is `display_name`, not `name`. Variant create requires `{ kind: "ab" | "locale", slug, locale? }`, not `{ slug, weight }`. Analytics timeline query is `{ since: <ISO-8601> }`, not `{ bucket, lookback }`.
  - **agora** — Community create body is `display_name`, not `name`. Post create requires `actor_id` in the body alongside the `X-Acting-As` header.
  - **productcraft (umbrella)** — Envoi send example used `/v1/mailboxes/{mailboxId}/messages/send`, which 404s. Real path is `/v1/workspaces/{workspace_id}/templates/{name}/send`.

  No code changes — README-only. Patch bump per package so the new README ships in the tarball.

- Updated dependencies [a757470]
  - @productcraft/platform-auth@0.0.5
  - @productcraft/heimdall@0.2.1
  - @productcraft/envoi@0.0.5
  - @productcraft/rally@0.0.5
  - @productcraft/agora@0.0.6

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

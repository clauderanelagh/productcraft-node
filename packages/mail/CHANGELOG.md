# @productcraft/envoi

## 0.1.1

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/core@0.2.0

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
  - @productcraft/core@0.1.0

## 0.0.9

### Patch Changes

- ffab086: Regenerate all surfaces from the post-rebrand-scrub API specs: every
  operation/property description now uses the new product names (Auth,
  Mail, Social, Waitlist); stale permission strings in descriptions
  corrected to the live catalog (auth._/mail._/social._/waitlist._).
  The Waitlist workspace-settings endpoint is now documented at its
  canonical path `/v1/workspaces/{workspace_id}/waitlist/settings`
  (the old `/rally/settings` path still works on the wire for existing
  clients). No request/response shape, auth, or scope changes.

## 0.0.8

### Patch Changes

- 3f9c383: Regenerate all specs against the rebranded production APIs.

  Now that the monorepo's OpenAPI `setTitle()` calls are fixed, the live
  `/docs-json` serves the new product names, so `pnpm refresh-specs` picks up
  the correct branding (`Auth API`, `Social API`, `Mail API`, `Waitlist API`)
  plus every API change since the last (pre-rebrand) snapshot:
  - **heimdall (Auth)** — **breaking surface change.** The invite API was
    redesigned from app/workspace invites to **end-user invites**. The old
    `appController*Invite` operations are gone, so the SDK wrappers were
    retargeted:
    - `heimdall.app(appId).invites.{list,create,revoke}` now drive the
      end-user-invite admin endpoints (`/v1/apps/{app_id}/end-users/invites`);
      `create` takes `CreateEndUserInviteDto` (was `CreateInviteDto`).
    - `heimdall.consumer(slug).auth.acceptInvite(...)` is new — the
      accept-invite flow moved to the consumer (end-user) surface
      (`/{app_slug}/v1/auth/accept-invite`, `ConsumerAcceptInviteDto`).
    - `heimdall.apps.acceptInvite(...)` was **removed** (the app-admin
      accept operation no longer exists upstream).
    - Exported types: `CreateInviteDto` / `AcceptInviteDto` →
      `CreateEndUserInviteDto` / `ConsumerAcceptInviteDto`, plus
      `EndUserInviteResponseDto`.
  - **envoi (Mail)** — picks up the GitHub-OAuth integration endpoints +
    fields added since the snapshot.
  - **platform-auth** — picks up the Apple/OAuth sign-in fields +
    `email_verified_at` and related additions.
  - **agora (Social)** — permission-scope strings in error descriptions
    rebranded (`agora.* → social.*`).
  - **rally (Waitlist)** — description copy refreshed (`mailbox-api → mail-api`).

## 0.0.7

### Patch Changes

- Updated dependencies [734798c]
  - @productcraft/core@0.0.5

## 0.0.6

### Patch Changes

- Updated dependencies [d18aa84]
  - @productcraft/core@0.0.4

## 0.0.5

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

## 0.0.4

### Patch Changes

- d8e5170: Rewrite the README + package.json description to match Envoi's actual surface — a receive-and-store mail platform with template-rendered sends, workspace-scoped mailboxes + domains + DKIM, message timeline, suppression lists, and outbound webhooks. The v0.0.3 README documented a fictional `POST /v1/mailboxes/{mailboxId}/messages/send` shape; the live endpoint is `POST /v1/workspaces/{workspace_id}/templates/{name}/send` and is template-rendered with idempotency support. Quick-start + common-operations section now line up with what the live OpenAPI spec actually accepts.

## 0.0.3

### Patch Changes

- 52b6058: Refresh envoi OpenAPI types from production.
- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2

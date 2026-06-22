# @productcraft/rally

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

- 5c6f806: Rewrite the README + package.json description to match Rally's actual surface — waitlist management with public-form signups, variants for A/B/n landing pages, referrals, position + leaderboard, approval workflow with invite-to-app, signed outbound webhooks, and CSV export. Quick-start now correctly distinguishes the public unauthenticated submit endpoint from the workspace-admin path, includes the `recaptcha_token` field, and surfaces the variant/referral round-trip flow customers actually use.

## 0.0.3

### Patch Changes

- 52b6058: Refresh rally OpenAPI types from production.
- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2

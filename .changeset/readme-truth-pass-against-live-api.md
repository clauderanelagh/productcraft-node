---
"@productcraft/platform-auth": patch
"@productcraft/heimdall": patch
"@productcraft/envoi": patch
"@productcraft/rally": patch
"@productcraft/agora": patch
"productcraft": patch
---

README truth pass against the live API.

Verified end-to-end on prod (2026-05-25) during an SDK shakedown. Six READMEs had request/response shapes the API rejects when copy-pasted:

- **platform-auth** — Quickstart claimed `data.policy.statements[…]` + `data.enabled_services[…]`; real wire is flat `data.policy: PolicyStatement[]` + `data.services: string[]`. `/v1/introspect/api-key` is **POST**, not GET. Workspace create body is `display_name`, not `name`. PAT mint requires `policy_ids: [<uuid>]` referencing pre-authored `workspace_policy` rows — not an inline `policy: [...]`. Added an auth-mode table explaining which surfaces accept PAK vs. require human session.
- **heimdall** — Removed non-existent `heimdall.idp.list()`. Fixed `apps.create` to `{ display_name, slug, workspace_id }` (was `{ name, slug }`). Fixed `app.endUsers.update` to `{ display_name?, email? }` and added the separate `updateStatus` call. Roles are two-step: `create({ name })` then `setPermissions(roleName, { permissions })` — the SDK type doesn't carry `permissions` on create. Added required `permissions: []` to `apiKeys.create`. Consumer signup body is `{ email, password, username, display_name? }`, not `{ identifier, password }`. Password reset body is `{ token, new_password }`. Auth-config update uses flat camelCase fields (`passwordMinLength: 12`), not nested `{ passwordPolicy: { ... } }`.
- **envoi** — Template lint body is `body_html` (wire) / `bodyHtml` (camelCase DTO), not `html`.
- **rally** — Waitlist create body is `display_name`, not `name`. Variant create requires `{ kind: "ab" | "locale", slug, locale? }`, not `{ slug, weight }`. Analytics timeline query is `{ since: <ISO-8601> }`, not `{ bucket, lookback }`.
- **agora** — Community create body is `display_name`, not `name`. Post create requires `actor_id` in the body alongside the `X-Acting-As` header.
- **productcraft (umbrella)** — Envoi send example used `/v1/mailboxes/{mailboxId}/messages/send`, which 404s. Real path is `/v1/workspaces/{workspace_id}/templates/{name}/send`.

No code changes — README-only. Patch bump per package so the new README ships in the tarball.

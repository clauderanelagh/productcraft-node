---
"@productcraft/heimdall": minor
"@productcraft/envoi": patch
"@productcraft/rally": patch
"@productcraft/agora": patch
"@productcraft/platform-auth": patch
---

Regenerate all specs against the rebranded production APIs.

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

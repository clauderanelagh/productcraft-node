# @productcraft/platform-auth

## 1.4.0

### Minor Changes

- 9640994: Spec refresh. `@productcraft/flags`: every management method now documents `UNAUTHORIZED` (401) and the retryable `MANAGEMENT_UNAVAILABLE` (503, `Retry-After`) errors. Environment, config, setting and segment keys carry their pattern and length limits in the types and docs, and the evaluation warning `iso_date_converted` is now typed. `@productcraft/platform-auth`: the Flags and Notify key presets (`flags`, `flags-dev`, `notify-send`, `notify-readonly`) and the `flags` and `notify` products are now typed.

## 1.3.0

### Minor Changes

- fbb9f47: Fixes from the Platform SDK review, made in the Platform API's spec (RobertBerglund/monorepo#1134) and the generator:
  - `workspaces.apiKeys.create` and `apiKeys.preview` take exactly one of `preset` or `policy_ids`. `{ name }` alone, or both fields, is now a compile error; the API already answered `400 VALIDATION_ERROR` to both, so no working call is affected. The api.md example mints from a preset.
  - `include_revoked` on `workspaces.apiKeys.list` is a `boolean` (`{ include_revoked: false }`), like every other flag. The string form `"false"` no longer type-checks; the wire value is unchanged.
  - A workspace key calling a workspace route with its own slug now gets `200` or `PermissionDeniedError` (403) instead of `InternalServerError` after three attempts, and another workspace's slug is `403 NOT_A_MEMBER`. Every session-only operation lists `PAK_NOT_PERMITTED` in its JSDoc and api.md.
  - `PlatformAuthErrorCode` drops the five `WEBHOOK_*` codes: Platform sends no webhooks. The union stays open.
  - README examples call operations with a credential they accept: members are listed with a workspace key, and the idempotency example creates a policy with a person's session. Descriptions no longer point at internal files, and update examples use realistic values instead of `"string"`.

## 1.2.0

### Minor Changes

- b5edeb1: Re-export `PaymentRequiredError` (402). Trawl's `jobs.create` documents `402 TRAWL_CREDITS_EXHAUSTED`, so its JSDoc and api.md error table now list it.

  Noun model names from the spec: Trawl's stats are `Trawl.Stats`, `StatsTotals`, `StatsWindowTotals`, `StatsSeries` and `StatsSeriesPoint`; every product's webhook lists and replay are `WebhookEndpointList`, `WebhookEventList` and `WebhookEventReplay`. The former names (`TrawlWorkspaceStats`, `ListWebhookEndpoints`, `ReplayWebhookEvent`, …) stay as deprecated aliases. Examples name their results after the thing (`const webhookEndpoint`, `const stats`), not the response shape.

### Patch Changes

- Updated dependencies [b5edeb1]
  - @productcraft/core@1.3.0

## 1.1.0

### Minor Changes

- 9536669: App-mail review fixes, all from the spec or the shared runtime:
  - **`withResponse().rateLimit` works on every product.** ProductCraft APIs send one set of `X-RateLimit-*` headers per named window (`-short`, one second; `-long`, one minute), which 1.x parsed as nothing. `rateLimit` is now the binding window (fewest left), with `window` naming it and `windows` holding each one. New type `RateLimitWindow`.
  - **Mail: a send without content no longer compiles.** `Mail.EmailSendParams` (and each `emails.batch` row) is html with a subject, text with a subject, or a template; `mail.emails.send({ from, to })`, and html together with a template, are type errors instead of a 400 `EMAIL_CONTENT_CONFLICT`. The generated examples in api.md and the README send a body.
  - **Model names are nouns.** Mail: `EmailSendResponse` (was `SendEmail`), `EmailBatchResponse` (`SendBatchOpenApi`), `TemplateSendResponse` (`SendAccepted`), `MessageEraseResponse` (`DeleteByRecipient`), `IntegrationList`, `SmtpConfigList`, `TemplateTagList`; every product with webhooks: `WebhookEventTypeList` (was `ListWebhookEventTypes`). The old names stay as deprecated aliases for all of 1.x. Object models are named interfaces, so editors show `Mail.WebhookEndpointWithSecret`, not `components["schemas"]["WebhookEndpointWithSecretDto"]`.
  - **Mail: `received.timeline()`** is the daily count of received mail (it never counted sends). `messages.timeline()` and `Mail.MessageTimelineParams` stay as deprecated aliases.
  - **Mail: `mailboxes.messages.*(mailboxId, messageId)`** instead of `(id, mid)` (positional names only; calls are unchanged).
  - **Every product re-exports the runtime's types**: `import type { Page, PagePromise, APIPromise, RequestOptions, ClientOptions, PollOptions, WithResponse, RateLimitInfo, LastResponse } from "@productcraft/mail"`, and in the namespace (`Mail.Page<Mail.Email>`), so nothing has to import `@productcraft/core`, which strict pnpm and Yarn PnP refuse as a transitive dependency.

### Patch Changes

- Updated dependencies [9536669]
  - @productcraft/core@1.2.0

## 1.0.3

### Patch Changes

- 5084e47: Reference examples use the spec's parameter examples, and type hovers no longer show the internal `Open<…>` wrapper.
- Updated dependencies [5084e47]
  - @productcraft/core@1.1.0

## 1.0.2

### Patch Changes

- 99207cc: Types now resolve for CommonJS consumers on `moduleResolution: node16`/`nodenext`: each `exports` entry points `require` at the CommonJS declarations (`dist/*.d.cts`) instead of the ESM `.d.ts`, which TypeScript rejected with TS1479. `@productcraft/<product>/testing` now resolves under `moduleResolution: node10` too (a `typesVersions` fallback). `@productcraft/auth` no longer imports jose's ESM-only types in its public declarations; `AuthClaims`, `AuthGetKeyFn` and the JWKS key types are structurally identical and still work with `jose.jwtVerify`. No runtime change.
- Updated dependencies [99207cc]
  - @productcraft/core@1.0.1

## 1.0.1

### Patch Changes

- Updated dependencies [ac1db59]
- Updated dependencies [9facfd6]
- Updated dependencies [6aa992e]
  - @productcraft/core@1.0.0

## 1.0.0

### Major Changes

- a71329a: **@productcraft/platform-auth 1.0: generated resource methods, stable.** Every operation is now a method generated from the Platform OpenAPI spec over the shared `@productcraft/core` runtime:
  - `platform.workspaces.*` (`create`, `list`, `retrieve`, `update`, `delete`) with `members`, `invites`, `roles`, `policies`, `apiKeys` (`create`, `list`, `retrieve`, `update`, `updateBindings`, `rotate`, `preview`, `delete`, `presets`), `services` (`enable`, `disable`, `updateSettings`), `auditLogs`, `auditFeed` and `avatar.upload`; `platform.apiKeys.self()`, `platform.introspect.apiKey()` / `introspect.workspaces.retrieve()`, `platform.me`, `platform.sessions`, `platform.oauth.connections`, `platform.stats` and the public `platform.auth.signin/signup/refresh/password.*` routes.
  - Workspace routes take the workspace slug positionally (`platform.workspaces.retrieve("acme")`).
  - Avatar uploads take typed form fields (`{ file: File | Blob }`) and send `multipart/form-data`.
  - Auto-pagination (`for await`), automatic `Idempotency-Key` on writes that declare it, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`.
  - `@productcraft/platform-auth/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

  Breaking: a client constructed with a key or token in a browser now throws `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true`. `platformAuth.client` is still the typed `openapi-fetch` client over the same `paths`; the only `.client` change is that `POST /v1/introspect/api-key` no longer declares an `authorization` header parameter (since 0.2.0), so drop `params: { header: { authorization: "" } }`. Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/platform-auth-1.0.0.md

## 0.2.0

### Minor Changes

- cd07984: Refresh platform-auth OpenAPI types from production (SDK-grade Platform spec, monorepo platform-auth-api/021). Type-level changes that can need a code edit, hence a minor:
  - `POST /v1/auth/signin`, `/signup`, `/refresh` responses now type the real sign-in body (`access_token`, `token_type`, `expires_in`, optional `refresh_token`). The spec used to show the OAuth token response by mistake (`scope`, `policy`, `workspace_id` were never returned).
  - `GET /v1/workspaces/{workspace_slug}/api-keys` is typed as the paged `{ data, pagination }` envelope only, and the API now serves that envelope to SDK user agents (see `@productcraft/core`'s `.client` User-Agent).
  - `session_duration` is `"short" | "long" | number`; path ids (`id`, `role_id`, `policy_id`) are `format: uuid`; `DELETE …/policies/{policy_id}` types `deleted` as `boolean`.
  - New: `workspace_id` on `GET /v1/api-keys/self`, `Idempotency-Key` on every create (the key mint answers a replay with `409 PAK_ALREADY_MINTED`), `x-pc-sdk` names, described fields.

### Patch Changes

- Updated dependencies [d34d638]
  - @productcraft/core@0.4.1

## 0.1.3

### Patch Changes

- 4a00e63: Refresh platform-auth OpenAPI types from production.
- Updated dependencies [1a6edbb]
  - @productcraft/core@0.4.0

## 0.1.2

### Patch Changes

- 534e23d: Refresh platform-auth OpenAPI types from production.

## 0.1.1

### Patch Changes

- fc081fa: Refresh platform-auth OpenAPI types from production.

## 0.1.0

### Minor Changes

- ed8300f: Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

### Patch Changes

- d26dd1e: Refresh platform-auth OpenAPI types from production.
- Updated dependencies [ed8300f]
  - @productcraft/core@0.3.0

## 0.0.13

### Patch Changes

- f696df6: Refresh platform-auth OpenAPI types from production.
- 5adf146: Refresh platform-auth OpenAPI types from production.
- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.
- Updated dependencies [bee8f96]
  - @productcraft/core@0.2.1

## 0.0.12

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/core@0.2.0

## 0.0.11

### Patch Changes

- Updated dependencies [f49319c]
  - @productcraft/core@0.1.0

## 0.0.10

### Patch Changes

- ffab086: Regenerate all surfaces from the post-rebrand-scrub API specs: every
  operation/property description now uses the new product names (Auth,
  Mail, Social, Waitlist); stale permission strings in descriptions
  corrected to the live catalog (auth._/mail._/social._/waitlist._).
  The Waitlist workspace-settings endpoint is now documented at its
  canonical path `/v1/workspaces/{workspace_id}/waitlist/settings`
  (the old `/rally/settings` path still works on the wire for existing
  clients). No request/response shape, auth, or scope changes.

## 0.0.9

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

## 0.0.8

### Patch Changes

- 91e0664: Fix stale product hosts + permission scopes in the published READMEs after
  the platform rebrand. The SDK's runtime base URLs (in `@productcraft/core`)
  were already retargeted; these are the doc strings that lagged behind:
  - **heimdall** — the documented JWT `iss` value and the "generated from"
    spec host now read `https://api.auth.productcraft.co` (was the retired
    `api.heimdall.productcraft.co`). A customer who pinned the old issuer in
    their own verifier would reject otherwise-valid tokens.
  - **agora** — spec host is `https://social.productcraft.co` (was `agora.`).
  - **rally** — spec host is `https://api.waitlist.productcraft.co` (was
    `api.rally.`).
  - **platform-auth** — the IAM policy examples use the rebranded permission
    actions (`heimdall.* → auth.*`, `envoi.* → mail.*`); resource-URN
    namespaces (`pcft:heimdall:` / `pcft:envoi:`) intentionally stay as-is,
    matching what the services still emit.

  Docs-only — no runtime or type changes. Package/surface names are unchanged
  (the public-API rename is deferred to v1.0).

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

- ed0d60c: Full README audit + rewrite. The v0.0.3 README was a one-paragraph stub; expand to cover the actual API surface — authentication (sign-in / signup / refresh / logout / password reset / verification), introspect (used by every other ProductCraft backend to resolve permissions), workspaces, members + invites, roles, IAM policies + the action catalogue, workspace API keys + bindings, service activation, audit feeds. Adds a "Which SDK do I want?" table up top so callers don't confuse Platform-Auth (your ProductCraft team's account) with Heimdall (the end-users of products you build on top).

## 0.0.3

### Patch Changes

- 52b6058: Refresh platform-auth OpenAPI types from production.
- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2

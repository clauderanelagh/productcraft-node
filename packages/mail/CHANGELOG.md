# @productcraft/mail

## 1.4.0

### Minor Changes

- b5edeb1: Re-export `PaymentRequiredError` (402). Trawl's `jobs.create` documents `402 TRAWL_CREDITS_EXHAUSTED`, so its JSDoc and api.md error table now list it.

  Noun model names from the spec: Trawl's stats are `Trawl.Stats`, `StatsTotals`, `StatsWindowTotals`, `StatsSeries` and `StatsSeriesPoint`; every product's webhook lists and replay are `WebhookEndpointList`, `WebhookEventList` and `WebhookEventReplay`. The former names (`TrawlWorkspaceStats`, `ListWebhookEndpoints`, `ReplayWebhookEvent`, …) stay as deprecated aliases. Examples name their results after the thing (`const webhookEndpoint`, `const stats`), not the response shape.

### Patch Changes

- Updated dependencies [b5edeb1]
  - @productcraft/core@1.3.0

## 1.3.0

### Minor Changes

- a689df7: From the app-waitlist review, in the generator:
  - **`signWebhook()` in `/testing`.** Every product with webhooks exports `signWebhook({ payload, secret })` from `@productcraft/<product>/testing`. It signs a test event the way ProductCraft signs deliveries, for a webhook handler test that has no client (the same as `webhooks.sign()`).
  - **Enum path arguments are typed.** A positional argument whose path parameter is an enum takes that union instead of `string`, so `auth.consumer(slug).auth.signinWithProvider("facebook", ...)` no longer compiles. A `string` variable needs narrowing to the union first.

## 1.2.0

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

## 1.1.0

### Minor Changes

- 5084e47: `webhooks.sign({ payload })` signs a test event the way ProductCraft signs deliveries, for testing a handler with `webhooks.unwrap`. Reference examples use the spec's parameter examples, and type hovers no longer show the internal `Open<…>` wrapper.

### Patch Changes

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

- 1ab255f: **@productcraft/mail 1.0: generated resource methods, stable.** Every operation is now a method generated from the Mail OpenAPI spec over the shared `@productcraft/core` runtime:
  - `mail.emails.send/batch/list/retrieve/metrics` (the Resend-shaped raw send), `mail.templates.*` including `templates.send(name, { to, data })`, `mail.messages.list/retrieve/timeline/body/export/erase` (the per-recipient delivery log), `mail.domains.*` with `mail.domains.poll(id)`, plus contacts, segments, topics, broadcasts, suppression, mailboxes, received mail, sending defaults, SMTP config, stats and `mail.webhooks.endpoints/events/eventTypes/attempts`.
  - `mail.webhooks.unwrap({ payload, headers, secret? })` verifies a delivery against one or several secrets (default, per-domain, endpoint), Standard Webhooks or the older `X-Mail-Signature`, and returns the typed event union (`email.delivered`, `email.bounced`, `domain.verified`, …, then `UnknownWebhookEvent`).
  - Auto-pagination (`for await`), automatic `Idempotency-Key` on sends and creates, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes (`NotFoundError`, `BadRequestError` with `errors[]`, `UnprocessableEntityError`, …) carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`. CSV exports, raw MIME and attachments resolve to the raw `Response`.
  - `new Mail({ apiKey, workspaceId })`; `@productcraft/mail/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

  Not breaking for `.client` users: `mail.client` is still the typed `openapi-fetch` client over the same `paths`. The deprecated default and per-domain webhook routes have no SDK methods (use `.client` or move to `webhooks.endpoints`). Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/mail-1.0.0.md

## 0.3.0

### Minor Changes

- 8033fb8: Refresh mail OpenAPI types from production (mail-api/063, the SDK-grade Mail spec). Type-level changes on `.client`: response enums are named schemas, the 23 webhook events have typed payload schemas, `limit` query params are integers, template `data` and `variables_schema` are open objects, `POST /contacts/{contact}/segments/{segment_id}` documents only 201 (the API now answers 201 whether or not the contact was already a member), and the Domain Connect browser callback is no longer in the spec. No runtime change in the client.

## 0.2.4

### Patch Changes

- 32e342a: Refresh mail OpenAPI types from production.

## 0.2.3

### Patch Changes

- 4a00e63: Refresh mail OpenAPI types from production.
- Updated dependencies [1a6edbb]
  - @productcraft/core@0.4.0

## 0.2.2

### Patch Changes

- 534e23d: Refresh mail OpenAPI types from production.

## 0.2.1

### Patch Changes

- fc081fa: Refresh mail OpenAPI types from production.

## 0.2.0

### Minor Changes

- ed8300f: Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

### Patch Changes

- Updated dependencies [ed8300f]
  - @productcraft/core@0.3.0

## 0.1.2

### Patch Changes

- f696df6: Refresh mail OpenAPI types from production.
- 5adf146: Refresh mail OpenAPI types from production.
- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.
- Updated dependencies [bee8f96]
  - @productcraft/core@0.2.1

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

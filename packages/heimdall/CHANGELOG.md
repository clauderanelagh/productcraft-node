# @productcraft/heimdall

## 0.2.1

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

## 0.2.0

### Minor Changes

- 543300b: Per-app issuer + audience on Consumer-API token verification, and a shorter passport-jwt helper.

  The v0.1.0 SDK derived `expectedIssuer` as `baseUrl + appSlug` (`https://api.heimdall.productcraft.co/my-app`). The Heimdall Consumer API at the time minted every token with `iss: "heimdall"` (literal string), so `scope.verifyToken(...)` always threw `JwtIssuerMismatchError`.

  The right fix landed on the server side: tokens now mint with `iss: <heimdallApiPublicUrl>/<appSlug>` (e.g. `https://api.heimdall.productcraft.co/my-app`) and `aud: <appSlug>`. The per-app issuer gives customers something meaningful to pin in their verifier — a token minted for another app on the platform now fails the `iss` check at the application layer too, not just by JWKS-fetch-targeting.

  `@productcraft/heimdall` changes:
  - `scope.expectedIssuer` is back to the URL form: `${baseUrl}/${appSlug}`.
  - `scope.expectedAudience` is new and equals the app slug.
  - `scope.acceptedIssuers` is new — the array of issuer strings `verifyToken` accepts (per-app URL + the legacy `"heimdall"` literal) during the transition window.
  - `scope.verifyToken(token)` now enforces `aud` by default; pass `{ audience: undefined }` to skip.
  - `HEIMDALL_CONSUMER_ISSUER` is renamed to `HEIMDALL_LEGACY_ISSUER` — same value, clearer name.
  - The `expectedAudience` config option on `HeimdallConfig` (introduced as a stub in earlier drafts) is removed; pin audience by-call via `verifyToken(token, { audience: "..." })` if you mint custom tokens with the heimdall key.

  `@productcraft/heimdall-passport` changes:
  - New `createHeimdallJwtStrategy(scope, verify, opts?)` helper builds a fully-configured `passport-jwt` strategy in one call — wires `secretOrKeyProvider`, `issuer` (both per-app URL + legacy literal), `audience` (app slug), `jwtFromRequest` (default: bearer header), and `algorithms` (default: `["RS256"]`). The previous example required ~10 lines of boilerplate per app; now it's 3.
  - `createPassportSecretOrKeyProvider(scope)` stays available for callers who want to compose with `passport-jwt`'s `new Strategy(...)` directly.

  **Breaking** (pre-1.0):
  - `HEIMDALL_CONSUMER_ISSUER` is gone — replace with `HEIMDALL_LEGACY_ISSUER` if you reference it, or just use `scope.expectedIssuer` / `scope.acceptedIssuers` from a `ConsumerScope` instance.
  - `scope.expectedIssuer` is no longer the literal `"heimdall"` string. Code that pins to the literal must switch to `scope.expectedIssuer` (the per-app URL) or `scope.acceptedIssuers` (both forms during the migration window).
  - `verifyToken` now enforces `aud === scope.expectedAudience` by default — pass `{ audience: undefined }` if you don't want this.

## 0.1.0

### Minor Changes

- 52b6058: Add `consumer(slug).auth.signinWithProvider({ provider, id_token, nonce, user? })` — federated sign-in (currently Apple) that exchanges a provider-issued identity token for a Heimdall `{ access_token, refresh_token }` pair. Same response shape as `auth.signin`; account linking on verified-email match is governed by the app's `oauth_link_policy`.

  Realign with the latest production OpenAPI spec:
  - **Renamed:** `ConsumerRequestResetDto` → `ConsumerRequestPasswordResetDto` (the underlying endpoint moved from `/auth/request-reset` to `/auth/request-password-reset`). The `consumer.auth.requestReset(...)` method name is unchanged.
  - **Removed:** the workspace-level `heimdall.idp.*` admin namespace (`idp.list`, `idp.start`, `idp.redirect`, `idp.exchange`, `idp.verifyIdToken`). Federated IdP configuration moved to per-app `auth_config_provider` rows; configure providers through `app(appId).authConfig.*` and consume them client-side via `consumer(slug).auth.signinWithProvider`.
  - **Re-typed:** `heimdall.stats.get()` now accepts an optional `{ workspaceId }` to scope counts to a single workspace (omitting it totals across every workspace the caller belongs to).

  Add a README to the published tarball — the v0.0.2 publish predated the README commit so npmjs.com showed "no README" for the package.

- 9cfa43f: Heimdall SDK v0.1 — ergonomic per-tag namespaces, scope factories, JWT verify.

  The `Heimdall` class now exposes three caller contexts instead of a single
  `client.GET/POST` surface:
  - **Workspace admin** — `heimdall.apps`, `heimdall.idp`, `heimdall.stats`
  - **App-scoped admin** — `heimdall.app(appId).{endUsers,roles,permissions,apiKeys,credentials,auditLogs,authConfig,invites,members}`
  - **Consumer (BFF)** — `heimdall.consumer(appSlug).{auth,me,verify,oauth}`

  Most of the SDK is generated from the OpenAPI spec via `kubb` — only the
  thin resource classes that compose the generated functions into namespaces
  are hand-written.

  JWT verification is built-in: `scope.verifyToken(token)` runs against a
  self-managed JWKS cache (jose's `createRemoteJWKSet` under the hood —
  TTL, singleflight, kid-miss rotation handling). The cache + key resolver
  also compose with `jose.jwtVerify`, NestJS guards, and Hono middleware
  through `scope.jwks.getKey` and `scope.expectedIssuer`.

  New companion package: `@productcraft/heimdall-passport` provides a
  `createPassportSecretOrKeyProvider(scope)` helper for existing Passport
  setups.

### Patch Changes

- Updated dependencies [52b6058]
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2

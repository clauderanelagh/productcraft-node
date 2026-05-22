# @productcraft/heimdall

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

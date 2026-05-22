---
"@productcraft/heimdall": minor
---

Add `consumer(slug).auth.signinWithProvider({ provider, id_token, nonce, user? })` — federated sign-in (currently Apple) that exchanges a provider-issued identity token for a Heimdall `{ access_token, refresh_token }` pair. Same response shape as `auth.signin`; account linking on verified-email match is governed by the app's `oauth_link_policy`.

Realign with the latest production OpenAPI spec:

- **Renamed:** `ConsumerRequestResetDto` → `ConsumerRequestPasswordResetDto` (the underlying endpoint moved from `/auth/request-reset` to `/auth/request-password-reset`). The `consumer.auth.requestReset(...)` method name is unchanged.
- **Removed:** the workspace-level `heimdall.idp.*` admin namespace (`idp.list`, `idp.start`, `idp.redirect`, `idp.exchange`, `idp.verifyIdToken`). Federated IdP configuration moved to per-app `auth_config_provider` rows; configure providers through `app(appId).authConfig.*` and consume them client-side via `consumer(slug).auth.signinWithProvider`.
- **Re-typed:** `heimdall.stats.get()` now accepts an optional `{ workspaceId }` to scope counts to a single workspace (omitting it totals across every workspace the caller belongs to).

Add a README to the published tarball — the v0.0.2 publish predated the README commit so npmjs.com showed "no README" for the package.

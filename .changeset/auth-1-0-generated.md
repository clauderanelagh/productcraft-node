---
"@productcraft/auth": major
"@productcraft/auth-passport": major
"@productcraft/core": minor
---

**@productcraft/auth 1.0: every Auth operation, generated.** Auth moves onto the same generator and runtime as the other ProductCraft SDKs (kubb is retired). All of the Auth API is now reachable as methods, where 0.8 covered about a third:

- `auth.admin.app(appId)` (alias `auth.app(appId)`): end users (contacts, invites, imports, exports, bulk actions, sessions), roles and permissions, API keys, M2M credentials, auth config and providers, custom domains, tenants and tenant keys, audit logs and the audit sink, webhook endpoints and events, notification settings, WebAuthn config, sign-in tests. `auth.apps.*` and `auth.stats.*` at the root.
- `auth.consumer(slug)`, flattened: `signin`, `signup`, `refresh`, `logout`, `signinWithProvider`, `verifyEmail`, password reset and verification, MFA, `me.*` (profile, sessions, activity, contacts, avatar, MFA factors, step-up), tenants and tenant keys, admin users, `verify.token/authorize`, `oauth.token/introspect`, `wellKnown.jwks`.
- `auth.verifyToken(jwt, { app })` at the top level, one JWKS cache per app. `consumer(slug).verifyToken`, `jwks`, the passkey ceremonies and the issuer/audience properties are unchanged.
- Auto-pagination, automatic `Idempotency-Key` on writes that declare it, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes with `requestId` and `docUrl`, `lastResponse` and `.withResponse()`, typed webhooks (`auth.webhooks.unwrap`), `@productcraft/auth/testing` mocks; `signup()` and `me.retrieve()` are typed.
- The CommonJS build bundles `jose`, so `require("@productcraft/auth")` works on Node 20.3+ (it threw `ERR_REQUIRE_ESM` below Node 20.19).

Every 0.6 and 0.8 method name still works as a deprecated alias calling the same route, and `AuthHttpError` is an alias of `APIError` (`instanceof` still matches every API error). Breaking: query parameters use their snake_case wire names (`workspaceId` is `workspace_id`, `actorId` is `actor_id`), list methods return pages (`page.next_cursor`, `for await`), `AuthHttpError`'s `data`/`statusText` are `body`/`status`, and a workspace key in a browser needs `dangerouslyAllowBrowser: true`. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md

`@productcraft/auth-passport` 1.0 takes `@productcraft/auth` as a peer dependency (`^1.0.0-0 || ^1`) and its CommonJS build loads on Node 20.3+; its API is unchanged.

`@productcraft/core`: new client option `credentialFromEnv` (default `true`); `false` never reads `PRODUCTCRAFT_API_KEY`, which Auth's consumer scope uses.

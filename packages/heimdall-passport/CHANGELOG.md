# @productcraft/heimdall-passport

## 0.0.2

### Patch Changes

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

- Updated dependencies [52b6058]
- Updated dependencies [9cfa43f]
  - @productcraft/heimdall@0.1.0

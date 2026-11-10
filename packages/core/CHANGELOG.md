# @productcraft/core

## 1.4.0

### Minor Changes

- 0511b08: New package `@productcraft/flags` (preview): feature flags and remote settings.
  - `FlagsClient` downloads one config per environment and evaluates flags locally with `@productcraft/flags-engine`, so user attributes never leave your app: `getValue`, `getJson<T>`, `getValueDetails`, `getAllValues`, `snapshot()`, `defaultUser` / `setDefaultUser`; auto, lazy and manual polling with ETag reuse; a pluggable cache and `bootstrap` config as fail-safes; overrides from a map, a JSON file or an environment variable; `ready`, `configChanged`, `evaluated` and `error` hooks; it never throws after construction.
  - `Flags`: the generated management API client (projects, configs, environments, flags, targeting, segments, SDK keys, history, webhooks).
  - `@productcraft/flags/testing`: `createTestClient({ values })` for unit tests, plus the generated `createMockFetch()`.
  - `productcraft`: `pc.flags` (the management client).
  - `@productcraft/core`: exports `isBrowser`, `runtimeTag` and `sleep`, and `PC_BASE_URL.flags`.

## 1.3.0

### Minor Changes

- b5edeb1: `PaymentRequiredError` (402) joins the error map, so a 402 such as Trawl's `TRAWL_CREDITS_EXHAUSTED` is `instanceof PaymentRequiredError` instead of a bare `APIError`. It is not retried.

  `workspaceId` now takes a workspace slug as well as the UUID (`workspaceId: "testing-environment"`). Workspace routes take the UUID, so the slug is resolved once per process: through platform-auth with the client's own bearer token or cookie, or checked against the key's own workspace for an API key. A value that is neither a UUID nor a slug, or a slug that does not resolve, throws a `ConfigurationError` naming it before the product request is sent, instead of the API's opaque `400 Validation failed (uuid is expected)`.

  Error classes keep their public names in the built bundles: `err.constructor.name` is `APIError`, not `_APIError`.

## 1.2.0

### Minor Changes

- 9536669: App-mail review fixes, all from the spec or the shared runtime:
  - **`withResponse().rateLimit` works on every product.** ProductCraft APIs send one set of `X-RateLimit-*` headers per named window (`-short`, one second; `-long`, one minute), which 1.x parsed as nothing. `rateLimit` is now the binding window (fewest left), with `window` naming it and `windows` holding each one. New type `RateLimitWindow`.
  - **Mail: a send without content no longer compiles.** `Mail.EmailSendParams` (and each `emails.batch` row) is html with a subject, text with a subject, or a template; `mail.emails.send({ from, to })`, and html together with a template, are type errors instead of a 400 `EMAIL_CONTENT_CONFLICT`. The generated examples in api.md and the README send a body.
  - **Model names are nouns.** Mail: `EmailSendResponse` (was `SendEmail`), `EmailBatchResponse` (`SendBatchOpenApi`), `TemplateSendResponse` (`SendAccepted`), `MessageEraseResponse` (`DeleteByRecipient`), `IntegrationList`, `SmtpConfigList`, `TemplateTagList`; every product with webhooks: `WebhookEventTypeList` (was `ListWebhookEventTypes`). The old names stay as deprecated aliases for all of 1.x. Object models are named interfaces, so editors show `Mail.WebhookEndpointWithSecret`, not `components["schemas"]["WebhookEndpointWithSecretDto"]`.
  - **Mail: `received.timeline()`** is the daily count of received mail (it never counted sends). `messages.timeline()` and `Mail.MessageTimelineParams` stay as deprecated aliases.
  - **Mail: `mailboxes.messages.*(mailboxId, messageId)`** instead of `(id, mid)` (positional names only; calls are unchanged).
  - **Every product re-exports the runtime's types**: `import type { Page, PagePromise, APIPromise, RequestOptions, ClientOptions, PollOptions, WithResponse, RateLimitInfo, LastResponse } from "@productcraft/mail"`, and in the namespace (`Mail.Page<Mail.Email>`), so nothing has to import `@productcraft/core`, which strict pnpm and Yarn PnP refuse as a transitive dependency.

## 1.1.0

### Minor Changes

- 5084e47: Pagination stops with a `ProductCraftError` when the API returns a `next_cursor` the walk already sent, instead of fetching the same page forever (`for await`, `.pages()`, `getNextPage()`). New `signWebhook()` (and `APIClient.signWebhook`) signs a test event the way ProductCraft signs deliveries (Standard Webhooks), so a handler test needs no hand-rolled HMAC.

## 1.0.1

### Patch Changes

- 99207cc: Types now resolve for CommonJS consumers on `moduleResolution: node16`/`nodenext`: each `exports` entry points `require` at the CommonJS declarations (`dist/*.d.cts`) instead of the ESM `.d.ts`, which TypeScript rejected with TS1479. `@productcraft/<product>/testing` now resolves under `moduleResolution: node10` too (a `typesVersions` fallback). `@productcraft/auth` no longer imports jose's ESM-only types in its public declarations; `AuthClaims`, `AuthGetKeyFn` and the JWKS key types are structurally identical and still work with `jose.jwtVerify`. No runtime change.

## 1.0.0

### Major Changes

- 9facfd6: **Stable 1.0: `@productcraft/core` and the `productcraft` umbrella.** Together with `@productcraft/auth` 1.0 and `@productcraft/auth-passport` 1.0 this completes the move of every ProductCraft package onto one generator and one runtime.
  - `productcraft` 1.0 is the 0.4 surface (published only as a `next` preview) made stable: `new ProductCraft({ apiKey, workspaceId })`, one shared config with `overrides.<product>`, `pc.platform` (with `pc.platformAuth` as the same instance), lazily built products, and every error class, `verifyWebhook` and product type namespace re-exported. `pc.auth` is now Auth 1.x. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/productcraft-1.0.0.md (per product: https://github.com/clauderanelagh/productcraft-node/tree/main/docs/migrations).
  - `@productcraft/core` 1.0 declares the shared runtime stable (`APIClient`, retries, typed errors, pagination, polling, webhook verification). Nothing is removed: the 0.x helpers (`makeClient`, `PCAuth`, `PC_BASE_URL`) stay, deprecated. Node 20.3 or later.

  From 1.0 on, a spec refresh that only adds operations or optional fields is a minor release; a break is a major with a migration guide.

### Minor Changes

- ac1db59: **@productcraft/auth 1.0: every Auth operation, generated.** Auth moves onto the same generator and runtime as the other ProductCraft SDKs (kubb is retired). All of the Auth API is now reachable as methods, where 0.8 covered about a third:
  - `auth.admin.app(appId)` (alias `auth.app(appId)`): end users (contacts, invites, imports, exports, bulk actions, sessions), roles and permissions, API keys, M2M credentials, auth config and providers, custom domains, tenants and tenant keys, audit logs and the audit sink, webhook endpoints and events, notification settings, WebAuthn config, sign-in tests. `auth.apps.*` and `auth.stats.*` at the root.
  - `auth.consumer(slug)`, flattened: `signin`, `signup`, `refresh`, `logout`, `signinWithProvider`, `verifyEmail`, password reset and verification, MFA, `me.*` (profile, sessions, activity, contacts, avatar, MFA factors, step-up), tenants and tenant keys, admin users, `verify.token/authorize`, `oauth.token/introspect`, `wellKnown.jwks`.
  - `auth.verifyToken(jwt, { app })` at the top level, one JWKS cache per app. `consumer(slug).verifyToken`, `jwks`, the passkey ceremonies and the issuer/audience properties are unchanged.
  - Auto-pagination, automatic `Idempotency-Key` on writes that declare it, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes with `requestId` and `docUrl`, `lastResponse` and `.withResponse()`, typed webhooks (`auth.webhooks.unwrap`), `@productcraft/auth/testing` mocks; `signup()` and `me.retrieve()` are typed.
  - The CommonJS build bundles `jose`, so `require("@productcraft/auth")` works on Node 20.3+ (it threw `ERR_REQUIRE_ESM` below Node 20.19).

  Every 0.6 and 0.8 method name still works as a deprecated alias calling the same route, and `AuthHttpError` is an alias of `APIError` (`instanceof` still matches every API error). Breaking: query parameters use their snake_case wire names (`workspaceId` is `workspace_id`, `actorId` is `actor_id`), list methods return pages (`page.next_cursor`, `for await`), `AuthHttpError`'s `data`/`statusText` are `body`/`status`, and a workspace key in a browser needs `dangerouslyAllowBrowser: true`. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md

  `@productcraft/auth-passport` 1.0 takes `@productcraft/auth` as a peer dependency (`^1.0.0-0 || ^1`) and its CommonJS build loads on Node 20.3+; its API is unchanged.

  `@productcraft/core`: new client option `credentialFromEnv` (default `true`); `false` never reads `PRODUCTCRAFT_API_KEY`, which Auth's consumer scope uses.

### Patch Changes

- 6aa992e: **productcraft 0.4: one key, one shared config, every generated product.**
  - `new ProductCraft({ apiKey, workspaceId })`: `apiKey` is a shorthand for `auth: { type: "apiKey", key }`; `auth` still takes bearer and cookie credentials. Every option (`workspaceId`, `maxRetries`, `timeout`, `fetch`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`, `webhookSecret`) is shared by all products; `overrides.<product>` merges over it.
  - `pc.platform` is the Platform client; `pc.platformAuth` stays as the same instance.
  - Products are built on first access, so an app that only uses `pc.mail` never constructs the others. `PRODUCTCRAFT_WORKSPACE_ID` is read once, and without a workspace id every product shares one key lookup.
  - Re-exports every error class, `verifyWebhook`, each product's type namespace (`import type { Mail } from "productcraft"`) and its error-code type.

  `@productcraft/core`: the per-process workspace lookup cache is shared across duplicate copies of core (two products on different core versions still make one lookup).

## 0.4.1

### Patch Changes

- d34d638: The `.client` escape hatch (`makeClient`) now sends `User-Agent: productcraft-node/core@<version> node/<version>` outside the browser, unless you set one, like the generated clients do. Platform's `GET /v1/workspaces/{workspace_slug}/api-keys` answers SDK user agents with the paged `{ data, pagination }` envelope its types describe, also when you pass no `limit`.

## 0.4.0

### Minor Changes

- 1a6edbb: New shared runtime for the generated SDKs: `APIClient` with retries (exponential backoff, full jitter, `Retry-After`), automatic `Idempotency-Key` reused across retries, per-attempt timeouts and `AbortSignal`, `APIPromise` (`.withResponse()` with `requestId` and `rateLimit`, `.asResponse()`), a non-enumerable `lastResponse` on every result, cursor pagination (`for await`, `.pages()`, `.toArray({ maxItems })`), polling (`poll`, `createAndPoll`), workspace-id resolution, a browser guard (`dangerouslyAllowBrowser`), `logLevel`/`logger`, and `verifyWebhook` for Standard Webhooks and the legacy `X-<Product>-Signature` scheme. Errors are classes you can catch (`APIError`, `NotFoundError`, `RateLimitError`, `IdempotencyKeyReuseError`, `ConfigurationError`, ...) and `instanceof` works across the ESM and CJS builds. A POST or PATCH without an idempotency key is never retried.

  Existing exports (`PCAuth`, `PCClientConfig`, `PC_BASE_URL`, `resolveAuth`, `makeClient`, ...) are unchanged; `makeClient` is deprecated in favour of `APIClient` + `createOpenAPIClient`.

  **Node 20.3 or later is now required** (`engines: ">=20.3"`): Node 18 is end-of-life and lacks `AbortSignal.any`. The other packages declare the same floor from their next release.

## 0.3.0

### Minor Changes

- ed8300f: Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

## 0.2.1

### Patch Changes

- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.

## 0.2.0

### Minor Changes

- 2904862: Add `@productcraft/trawl` — typed client for the ProductCraft Trawl AI
  web-extraction API (jobs + webhooks). Also surfaced on the `productcraft`
  umbrella as `pc.trawl`, and `PC_BASE_URL.trawl` added to `@productcraft/core`.

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

## 0.0.5

### Patch Changes

- 734798c: Retarget default base URLs for the platform-auth re-domain:
  - `platformAuth` → `api.platform-auth.productcraft.co` — the platform
    identity layer vacated `api.auth` so the customer-facing Auth product
    could take it. Pointing the SDK at `api.auth` for platform calls would
    now hit the wrong service.
  - `heimdall` (the Auth product) → `api.auth.productcraft.co` (its new
    canonical host; `api.users` / `api.heimdall` stay as aliases).
  - `agora` → `social.productcraft.co` (Agora → Feed → Social).

  Non-breaking — old hosts remain live as aliases. Surface keys/classes
  unchanged until the v1.0.0 rename.

## 0.0.4

### Patch Changes

- d18aa84: Retarget default base URLs to the renamed production services: Rally→Waitlist
  (`api.waitlist.productcraft.co`), Agora→Feed (`feed.productcraft.co`), and
  Heimdall→users (`api.users.productcraft.co`). Envoi/Mail (`api.mail`) and
  Platform-Auth (`api.auth`) are unchanged. The surface keys/classes
  (`rally`/`agora`/`heimdall`) are intentionally kept, so this is a non-breaking
  retarget; the public-API rename to `waitlist`/`feed`/`users` lands in v1.0.0.

## 0.0.3

### Patch Changes

- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.

## 0.0.2

### Patch Changes

- 47e7e8c: Verify the CI release pipeline + trusted publishing end-to-end.

# productcraft

## 1.3.0

### Minor Changes

- 0511b08: New package `@productcraft/flags` (preview): feature flags and remote settings.
  - `FlagsClient` downloads one config per environment and evaluates flags locally with `@productcraft/flags-engine`, so user attributes never leave your app: `getValue`, `getJson<T>`, `getValueDetails`, `getAllValues`, `snapshot()`, `defaultUser` / `setDefaultUser`; auto, lazy and manual polling with ETag reuse; a pluggable cache and `bootstrap` config as fail-safes; overrides from a map, a JSON file or an environment variable; `ready`, `configChanged`, `evaluated` and `error` hooks; it never throws after construction.
  - `Flags`: the generated management API client (projects, configs, environments, flags, targeting, segments, SDK keys, history, webhooks).
  - `@productcraft/flags/testing`: `createTestClient({ values })` for unit tests, plus the generated `createMockFetch()`.
  - `productcraft`: `pc.flags` (the management client).
  - `@productcraft/core`: exports `isBrowser`, `runtimeTag` and `sleep`, and `PC_BASE_URL.flags`.

### Patch Changes

- Updated dependencies [0511b08]
  - @productcraft/flags@0.1.0
  - @productcraft/core@1.4.0

## 1.2.0

### Minor Changes

- b5edeb1: Re-export `PaymentRequiredError` (402). Trawl's `jobs.create` documents `402 TRAWL_CREDITS_EXHAUSTED`, so its JSDoc and api.md error table now list it.

  Noun model names from the spec: Trawl's stats are `Trawl.Stats`, `StatsTotals`, `StatsWindowTotals`, `StatsSeries` and `StatsSeriesPoint`; every product's webhook lists and replay are `WebhookEndpointList`, `WebhookEventList` and `WebhookEventReplay`. The former names (`TrawlWorkspaceStats`, `ListWebhookEndpoints`, `ReplayWebhookEvent`, …) stay as deprecated aliases. Examples name their results after the thing (`const webhookEndpoint`, `const stats`), not the response shape.

### Patch Changes

- Updated dependencies [b5edeb1]
- Updated dependencies [b5edeb1]
  - @productcraft/core@1.3.0
  - @productcraft/trawl@1.4.0
  - @productcraft/mail@1.4.0
  - @productcraft/waitlist@2.1.0
  - @productcraft/social@1.6.0
  - @productcraft/auth@1.4.0
  - @productcraft/platform-auth@1.2.0

## 1.1.1

### Patch Changes

- Updated dependencies [a689df7]
- Updated dependencies [a689df7]
  - @productcraft/waitlist@2.0.0
  - @productcraft/auth@1.3.0
  - @productcraft/mail@1.3.0
  - @productcraft/social@1.4.0
  - @productcraft/trawl@1.3.0

## 1.1.0

### Minor Changes

- 5084e47: Re-exports `signWebhook` (and its types) from `@productcraft/core`.

### Patch Changes

- Updated dependencies [5084e47]
- Updated dependencies [5084e47]
- Updated dependencies [5084e47]
- Updated dependencies [5084e47]
  - @productcraft/auth@1.1.0
  - @productcraft/core@1.1.0
  - @productcraft/platform-auth@1.0.3
  - @productcraft/mail@1.1.0
  - @productcraft/social@1.2.0
  - @productcraft/trawl@1.1.0
  - @productcraft/waitlist@1.1.0

## 1.0.1

### Patch Changes

- 99207cc: Types now resolve for CommonJS consumers on `moduleResolution: node16`/`nodenext`: each `exports` entry points `require` at the CommonJS declarations (`dist/*.d.cts`) instead of the ESM `.d.ts`, which TypeScript rejected with TS1479. `@productcraft/<product>/testing` now resolves under `moduleResolution: node10` too (a `typesVersions` fallback). `@productcraft/auth` no longer imports jose's ESM-only types in its public declarations; `AuthClaims`, `AuthGetKeyFn` and the JWKS key types are structurally identical and still work with `jose.jwtVerify`. No runtime change.
- Updated dependencies [99207cc]
  - @productcraft/core@1.0.1
  - @productcraft/auth@1.0.1
  - @productcraft/mail@1.0.2
  - @productcraft/waitlist@1.0.2
  - @productcraft/social@1.1.2
  - @productcraft/trawl@1.0.5
  - @productcraft/platform-auth@1.0.2

## 1.0.0

### Major Changes

- 9facfd6: **Stable 1.0: `@productcraft/core` and the `productcraft` umbrella.** Together with `@productcraft/auth` 1.0 and `@productcraft/auth-passport` 1.0 this completes the move of every ProductCraft package onto one generator and one runtime.
  - `productcraft` 1.0 is the 0.4 surface (published only as a `next` preview) made stable: `new ProductCraft({ apiKey, workspaceId })`, one shared config with `overrides.<product>`, `pc.platform` (with `pc.platformAuth` as the same instance), lazily built products, and every error class, `verifyWebhook` and product type namespace re-exported. `pc.auth` is now Auth 1.x. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/productcraft-1.0.0.md (per product: https://github.com/clauderanelagh/productcraft-node/tree/main/docs/migrations).
  - `@productcraft/core` 1.0 declares the shared runtime stable (`APIClient`, retries, typed errors, pagination, polling, webhook verification). Nothing is removed: the 0.x helpers (`makeClient`, `PCAuth`, `PC_BASE_URL`) stay, deprecated. Node 20.3 or later.

  From 1.0 on, a spec refresh that only adds operations or optional fields is a minor release; a break is a major with a migration guide.

### Minor Changes

- 6aa992e: **productcraft 0.4: one key, one shared config, every generated product.**
  - `new ProductCraft({ apiKey, workspaceId })`: `apiKey` is a shorthand for `auth: { type: "apiKey", key }`; `auth` still takes bearer and cookie credentials. Every option (`workspaceId`, `maxRetries`, `timeout`, `fetch`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`, `webhookSecret`) is shared by all products; `overrides.<product>` merges over it.
  - `pc.platform` is the Platform client; `pc.platformAuth` stays as the same instance.
  - Products are built on first access, so an app that only uses `pc.mail` never constructs the others. `PRODUCTCRAFT_WORKSPACE_ID` is read once, and without a workspace id every product shares one key lookup.
  - Re-exports every error class, `verifyWebhook`, each product's type namespace (`import type { Mail } from "productcraft"`) and its error-code type.

  `@productcraft/core`: the per-process workspace lookup cache is shared across duplicate copies of core (two products on different core versions still make one lookup).

### Patch Changes

- Updated dependencies [ac1db59]
- Updated dependencies [9facfd6]
- Updated dependencies [6aa992e]
  - @productcraft/auth@1.0.0
  - @productcraft/core@1.0.0
  - @productcraft/mail@1.0.1
  - @productcraft/platform-auth@1.0.1
  - @productcraft/social@1.1.1
  - @productcraft/trawl@1.0.4
  - @productcraft/waitlist@1.0.1

## 0.3.9

### Patch Changes

- Updated dependencies [e8098b3]
  - @productcraft/auth@0.9.0

## 0.3.8

### Patch Changes

- Updated dependencies [a71329a]
  - @productcraft/platform-auth@1.0.0

## 0.3.7

### Patch Changes

- Updated dependencies [cd07984]
- Updated dependencies [d34d638]
  - @productcraft/platform-auth@0.2.0
  - @productcraft/core@0.4.1

## 0.3.6

### Patch Changes

- Updated dependencies [ca7418e]
- Updated dependencies [ca7418e]
- Updated dependencies [2514c25]
  - @productcraft/trawl@1.0.3
  - @productcraft/waitlist@1.0.0

## 0.3.5

### Patch Changes

- Updated dependencies [1ab255f]
  - @productcraft/mail@1.0.0

## 0.3.4

### Patch Changes

- Updated dependencies [8033fb8]
  - @productcraft/mail@0.3.0

## 0.3.3

### Patch Changes

- Updated dependencies [66d5b1d]
  - @productcraft/trawl@1.0.0

## 0.3.2

### Patch Changes

- Updated dependencies [4a00e63]
- Updated dependencies [4a00e63]
- Updated dependencies [4a00e63]
- Updated dependencies [4a00e63]
- Updated dependencies [4a00e63]
- Updated dependencies [4a00e63]
- Updated dependencies [1a6edbb]
  - @productcraft/auth@0.8.3
  - @productcraft/mail@0.2.3
  - @productcraft/platform-auth@0.1.3
  - @productcraft/social@1.0.2
  - @productcraft/trawl@0.2.3
  - @productcraft/waitlist@0.2.3
  - @productcraft/core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [911beab]
  - @productcraft/social@1.0.0

## 0.3.0

### Minor Changes

- ed8300f: Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

### Patch Changes

- Updated dependencies [d26dd1e]
- Updated dependencies [d26dd1e]
- Updated dependencies [d26dd1e]
- Updated dependencies [ed8300f]
- Updated dependencies [ed8300f]
  - @productcraft/auth@0.8.0
  - @productcraft/platform-auth@0.1.0
  - @productcraft/waitlist@0.2.0
  - @productcraft/core@0.3.0
  - @productcraft/mail@0.2.0
  - @productcraft/social@0.8.0
  - @productcraft/trawl@0.2.0

## 0.2.10

### Patch Changes

- bee8f96: Package metadata: homepage now points at the product docs on productcraft.co, an issue tracker link is listed, and README links work on npmjs.com.
- 03770cf: Depend on the current `@productcraft/auth` release again instead of the temporary `^0.6.0` pin.
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [f696df6]
- Updated dependencies [5adf146]
- Updated dependencies [bee8f96]
  - @productcraft/auth@0.7.1
  - @productcraft/mail@0.1.2
  - @productcraft/platform-auth@0.0.13
  - @productcraft/social@0.7.1
  - @productcraft/trawl@0.1.2
  - @productcraft/waitlist@0.1.2
  - @productcraft/core@0.2.1

## 0.2.9

### Patch Changes

- Hotfix: depend on the published `@productcraft/auth@^0.6.0` instead of the workspace version. `0.2.8` was released depending on `@productcraft/auth@^0.7.0`, which could not be published (npm now requires 2FA for the `@productcraft/*` names and the CI token was refused), so a fresh `npm install productcraft` failed to resolve. Switch back to `workspace:^` once `@productcraft/auth@0.7.0` is on npm.

## 0.2.8

### Patch Changes

- Updated dependencies [86afd44]
  - @productcraft/auth@0.7.0

## 0.2.7

### Patch Changes

- Updated dependencies [d37513a]
- Updated dependencies [85a1454]
  - @productcraft/auth@0.6.0

## 0.2.6

### Patch Changes

- Updated dependencies [bee9c6c]
  - @productcraft/social@0.7.0

## 0.2.5

### Patch Changes

- Updated dependencies [380f329]
  - @productcraft/social@0.6.0

## 0.2.4

### Patch Changes

- Updated dependencies [4688927]
- Updated dependencies [23adb6c]
- Updated dependencies [e7711bb]
- Updated dependencies [25494aa]
- Updated dependencies [a1b912e]
- Updated dependencies [01edb35]
- Updated dependencies [9c0ce88]
- Updated dependencies [590cfaa]
- Updated dependencies [e20766a]
- Updated dependencies [4688927]
- Updated dependencies [1d817c7]
- Updated dependencies [4afe599]
- Updated dependencies [1a255d6]
- Updated dependencies [86e54d2]
- Updated dependencies [eceee41]
  - @productcraft/social@0.5.0

## 0.2.3

### Patch Changes

- Updated dependencies [be3a774]
  - @productcraft/social@0.4.0

## 0.2.2

### Patch Changes

- Updated dependencies [d761107]
  - @productcraft/social@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [ee0f176]
- Updated dependencies [ee0f176]
  - @productcraft/auth@0.5.2
  - @productcraft/trawl@0.1.1
  - @productcraft/social@0.2.0

## 0.2.0

### Minor Changes

- 2904862: Add `@productcraft/trawl` — typed client for the ProductCraft Trawl AI
  web-extraction API (jobs + webhooks). Also surfaced on the `productcraft`
  umbrella as `pc.trawl`, and `PC_BASE_URL.trawl` added to `@productcraft/core`.

### Patch Changes

- Updated dependencies [2904862]
  - @productcraft/trawl@0.1.0
  - @productcraft/core@0.2.0
  - @productcraft/auth@0.5.1
  - @productcraft/mail@0.1.1
  - @productcraft/platform-auth@0.0.12
  - @productcraft/social@0.1.1
  - @productcraft/waitlist@0.1.1

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
  - @productcraft/auth@0.5.0
  - @productcraft/mail@0.1.0
  - @productcraft/waitlist@0.1.0
  - @productcraft/social@0.1.0
  - @productcraft/core@0.1.0
  - @productcraft/platform-auth@0.0.11

## 0.0.14

### Patch Changes

- Updated dependencies [ffab086]
  - @productcraft/heimdall@0.4.1
  - @productcraft/envoi@0.0.9
  - @productcraft/agora@0.0.11
  - @productcraft/rally@0.0.10
  - @productcraft/platform-auth@0.0.10

## 0.0.13

### Patch Changes

- Updated dependencies [3f9c383]
  - @productcraft/heimdall@0.4.0
  - @productcraft/envoi@0.0.8
  - @productcraft/rally@0.0.9
  - @productcraft/agora@0.0.10
  - @productcraft/platform-auth@0.0.9

## 0.0.12

### Patch Changes

- Updated dependencies [91e0664]
  - @productcraft/heimdall@0.3.3
  - @productcraft/agora@0.0.9
  - @productcraft/rally@0.0.8
  - @productcraft/platform-auth@0.0.8

## 0.0.11

### Patch Changes

- Updated dependencies [734798c]
  - @productcraft/core@0.0.5
  - @productcraft/agora@0.0.8
  - @productcraft/envoi@0.0.7
  - @productcraft/heimdall@0.3.2
  - @productcraft/platform-auth@0.0.7
  - @productcraft/rally@0.0.7

## 0.0.10

### Patch Changes

- Updated dependencies [d18aa84]
  - @productcraft/core@0.0.4
  - @productcraft/agora@0.0.7
  - @productcraft/envoi@0.0.6
  - @productcraft/heimdall@0.3.1
  - @productcraft/platform-auth@0.0.6
  - @productcraft/rally@0.0.6

## 0.0.9

### Patch Changes

- Updated dependencies [2b1e14e]
- Updated dependencies [7d797b4]
  - @productcraft/heimdall@0.3.0

## 0.0.8

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

- Updated dependencies [a757470]
  - @productcraft/platform-auth@0.0.5
  - @productcraft/heimdall@0.2.1
  - @productcraft/envoi@0.0.5
  - @productcraft/rally@0.0.5
  - @productcraft/agora@0.0.6

## 0.0.7

### Patch Changes

- Updated dependencies [543300b]
  - @productcraft/heimdall@0.2.0

## 0.0.6

### Patch Changes

- ed0d60c: Full README audit + rewrite. The v0.0.3 README was a one-paragraph stub; expand to cover the actual API surface — authentication (sign-in / signup / refresh / logout / password reset / verification), introspect (used by every other ProductCraft backend to resolve permissions), workspaces, members + invites, roles, IAM policies + the action catalogue, workspace API keys + bindings, service activation, audit feeds. Adds a "Which SDK do I want?" table up top so callers don't confuse Platform-Auth (your ProductCraft team's account) with Heimdall (the end-users of products you build on top).
- Updated dependencies [ed0d60c]
  - @productcraft/platform-auth@0.0.4

## 0.0.5

### Patch Changes

- 3cbd97b: Full README audit against the live API: documents both caller contexts (PlatformUser admin on `/v1/workspaces/{workspaceId}/...` vs customer-backend on `/v1/communities/{communityId}/...` with the `X-Acting-As` header), expands the quick-start with a "post on behalf of an EndUser" example, and adds a Common-Operations section covering posts + feeds, stories, social graph, notifications, direct conversations, and moderation. Notes that Agora's wire is snake_case both at the DTO level and in TS types (no name translation layer for this surface).
- d8e5170: Rewrite the README + package.json description to match Envoi's actual surface — a receive-and-store mail platform with template-rendered sends, workspace-scoped mailboxes + domains + DKIM, message timeline, suppression lists, and outbound webhooks. The v0.0.3 README documented a fictional `POST /v1/mailboxes/{mailboxId}/messages/send` shape; the live endpoint is `POST /v1/workspaces/{workspace_id}/templates/{name}/send` and is template-rendered with idempotency support. Quick-start + common-operations section now line up with what the live OpenAPI spec actually accepts.
- 5c6f806: Rewrite the README + package.json description to match Rally's actual surface — waitlist management with public-form signups, variants for A/B/n landing pages, referrals, position + leaderboard, approval workflow with invite-to-app, signed outbound webhooks, and CSV export. Quick-start now correctly distinguishes the public unauthenticated submit endpoint from the workspace-admin path, includes the `recaptcha_token` field, and surfaces the variant/referral round-trip flow customers actually use.
- Updated dependencies [3cbd97b]
- Updated dependencies [d8e5170]
- Updated dependencies [5c6f806]
  - @productcraft/agora@0.0.5
  - @productcraft/envoi@0.0.4
  - @productcraft/rally@0.0.4

## 0.0.4

### Patch Changes

- ce35855: Fix the package description + README framing — Agora is social infrastructure (communities, posts, feeds, stories, moderation), not "landing pages / marketing sites / content blocks" as the v0.0.3 README mistakenly claimed.
- Updated dependencies [ce35855]
  - @productcraft/agora@0.0.4

## 0.0.3

### Patch Changes

- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [52b6058]
- Updated dependencies [9cfa43f]
- Updated dependencies [52b6058]
  - @productcraft/agora@0.0.3
  - @productcraft/envoi@0.0.3
  - @productcraft/platform-auth@0.0.3
  - @productcraft/rally@0.0.3
  - @productcraft/heimdall@0.1.0
  - @productcraft/core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [47e7e8c]
  - @productcraft/core@0.0.2
  - @productcraft/agora@0.0.2
  - @productcraft/envoi@0.0.2
  - @productcraft/heimdall@0.0.2
  - @productcraft/platform-auth@0.0.2
  - @productcraft/rally@0.0.2

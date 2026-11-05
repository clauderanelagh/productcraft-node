# The ProductCraft Node SDK standard

Status: adopted 2026-11-05. Owner: the SDK maintainer (`clauderanelagh`). This document is the contract every `@productcraft/*` package is built to. The ordered work that gets us there lives in `tasks/` (this repo) and in `tasks/<app>/` in the monorepo; section 11 lists it.

## 1. Why this exists

Robert, 2026-11-06: "Auth has a nicely made interface with good Stripe-like DX while the others look like light fetch wrappers. They should have a high standard like Stripe, ideally generated automatically from the specs the APIs publish."

What we found (four read-only audits, 2026-11-05):

- **Mail, Waitlist, Social, Trawl and Platform-auth never got past v0.** Each is `openapi-typescript` types plus a class that exposes `.client` (raw `openapi-fetch`). Callers write URL strings and unpack `{ data, error }`. The "ergonomic wrappers in v0.1+" promised in `CLAUDE.md` never shipped.
- **Auth's good DX is mostly hand-written.** About 1,000 lines in `packages/auth/src/scopes/` sit over kubb functions named after controllers (`appControllerCloneApp`). They cover 62 to 73 of 224 operations. `client` is private, so the remaining two thirds of Auth are unreachable from the SDK.
- **No package has** retries, timeouts, auto-pagination, automatic `Idempotency-Key`, typed error classes, request IDs, raw-response access or webhook verification.
- **Spec and generator defects leak into types.** 67 free-form objects generate as `Record<string, never>`, which makes Mail's flagship `templates/{name}/send` untypeable. Fields with defaults become required (`--default-non-nullable`). Several README quick-starts do not compile.
- **The vendored specs are stale.** The nightly refresh PR (#95) has been open since 10-25 because bot pushes with `GITHUB_TOKEN` never trigger CI.

## 2. The target, by example

The bar is the Stripe Node SDK: resources and verbs you can guess, everything typed, failures you can catch by class, and plumbing (retries, idempotency, pagination) you never write.

### 2.1 Constructing clients

```ts
import { ProductCraft } from "productcraft";

// Umbrella: one key, every product. The key falls back to PRODUCTCRAFT_API_KEY.
const pc = new ProductCraft({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: "ws_..." });

// Or one product at a time (smaller install, same API).
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey, workspaceId: "ws_...", maxRetries: 3, timeout: 20_000 });
```

`apiKey` is the new shorthand. `auth: { type: "apiKey" | "bearer" | "cookie", ... }` (today's `PCAuth`) keeps working for bearer and cookie credentials.

`workspaceId` is optional. When it is missing, the client resolves it once from `GET /v1/api-keys/self` on first use and caches it. Workspace keys are single-workspace, so this is unambiguous. It can also come from `PRODUCTCRAFT_WORKSPACE_ID`.

### 2.2 Per product

```ts
// Mail
await mail.templates.send("welcome", { to: "ada@example.com", data: { first_name: "Ada" } });
for await (const message of mail.messages.list({ status: ["bounced"] })) { … }
const domain = await mail.domains.create({ name: "mail.example.com" });
await mail.domains.verify(domain.id);
// mail.emails.send({...}) arrives with the raw-send route (monorepo tasks/mail-api/002); the name is already reserved.

// Waitlist
const list = await waitlist.waitlists.create({ name: "Beta", slug: "beta" });
for await (const entry of waitlist.waitlists.entries.list(list.id)) { … }
await waitlist.public.entries.submit("acme", "beta", { email: "ada@example.com" });   // no key needed

// Trawl
const job = await trawl.jobs.create({ description: "Pricing tiers", json_schema: schema, urls: ["https://…"] });
const done = await trawl.jobs.retrieve(job.id);
await trawl.jobs.cancel(job.id);

// Social: community-scoped resources hang off a bound scope, like auth.app(id)
const community = social.community("com_...");
const post = await community.posts.create({ actor_id, body: "Hello" });
await community.posts.comments.create(post.id, { actor_id, body: "First!" });
const page = await community.posts.list({ limit: 50 });     // one page, typed
const all = await community.posts.list().toArray({ limit: 500 });

// Platform
const me = await platform.apiKeys.self();
const ws = await platform.workspaces.retrieve("acme");

// Auth: the names customers already use are kept (see section 7)
const session = await auth.consumer("my-app").auth.signin({ email, password });
const users = auth.app("app_...").endUsers.list({ limit: 100 });
for await (const u of users) { … }
const claims = await auth.consumer("my-app").verifyToken(jwt);   // hand-written, stays
```

### 2.3 Cross-cutting behaviour

```ts
// Per-request options: always the last argument.
await mail.templates.send("welcome", body, {
  idempotencyKey: "order-1234-welcome",   // overrides the automatic key
  timeout: 5_000,
  maxRetries: 0,
  headers: { "X-Trace": "abc" },
  signal: controller.signal,
});

// Raw response when you need headers (rate limits, Idempotent-Replay).
const { data, response, requestId } = await mail.domains.list().withResponse();

// Errors are classes you can catch.
try {
  await trawl.jobs.retrieve("job_missing");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else throw err;
}

// Webhooks: one verifier, typed events per product.
const event = mail.webhooks.unwrap(rawBody, req.headers, process.env.MAIL_WEBHOOK_SECRET);
if (event.type === "email.bounced") event.data.recipient;   // narrowed

// Escape hatch: unchanged, still typed, always available.
const { data: raw } = await mail.client.GET("/v1/workspaces/{workspace_id}/messages", { params: { path: { workspace_id } } });
```

## 3. Naming rules

Names are decided **in the spec, by the API**, and both the SDK generator and the MCP server read them. The SDK never keeps its own rename table.

### 3.1 The `x-pc-sdk` extension

Every operation in every public `/docs-json` carries:

```json
"x-pc-sdk": { "resource": "posts.comments", "method": "create", "bind": ["community_id"], "paginated": true }
```

or `"x-pc-sdk": false` for routes that are not API calls (browser redirects, HTML pages, OAuth callbacks, avatar image GETs) and for deprecated legacy webhook routes.

- **It is computed, not hand-typed.** A shared monorepo helper (`libs/openapi-sdk-nestjs`, task monorepo/021) walks the Nest document after `SwaggerModule.createDocument` and derives the default name from the path with the rules below. A `@SdkMethod("contacts.properties", "list")` decorator overrides it where the default reads badly, and `@SdkExclude()` sets `false`.
- **operationIds are not renamed.** The MCP server's curation and send-guard key on them (`apps/mcp-server/src/tools/send-guard.service.ts`, `generator/curation.ts`). They stay as stable internal IDs.
- **`libs/openapi-audit` enforces it.** Missing `x-pc-sdk`, a duplicate `resource.method` within one API, or a reserved word as a name fails the API's test suite.

### 3.2 Default derivation (Stripe's rules, applied to our paths)

1. Strip the version prefix and the bound scope (`/v1/workspaces/{workspace_id}`, `/v1/communities/{community_id}`, `/v1/apps/{app_id}`, `/{app_slug}/v1`).
2. Static segments become nested resources in camelCase (`end-users` becomes `endUsers`, `webhooks/endpoints` becomes `webhooks.endpoints`). Path parameters become positional arguments, outermost first.
3. Verbs by shape:

| Shape | Method |
|---|---|
| `GET /things` (paginated or array) | `list` |
| `POST /things` | `create` |
| `GET /things/{id}` | `retrieve` |
| `PATCH /things/{id}` or `PUT /things/{id}` | `update` |
| `DELETE /things/{id}` | `delete` |
| `PUT /things` (singleton settings) | `update`; `GET` on a singleton is `retrieve` |
| `POST /things/{id}/<verb>` | `<verb>` in camelCase (`cancel`, `verify`, `rotateSecret`) |
| `POST /things/<verb>` (collection action) | `<verb>` (`bulkDelete`, `import`) |

4. Verb vocabulary is closed: `list, create, retrieve, update, delete, search, send, cancel, verify` plus action verbs taken from the path. `remove`, `get`, `show`, `fire`, `getById`, `upsert` and `put` never appear as SDK methods.
5. Collisions fail the build (generator and audit). The 2026-11-05 dry run found 4 collisions across 756 operations, each fixed with `@SdkMethod`.

### 3.3 Scopes (`bind`)

`bind` lists the path parameters the client supplies instead of the caller:

| Parameter | How it is bound |
|---|---|
| `workspace_id` (Mail, Waitlist, Trawl, Platform stats) | client default (`workspaceId` option, environment, or `/v1/api-keys/self`); overridable per request via `options.workspaceId` |
| `community_id` (Social) | `social.community(id)` returns a scope object |
| `app_id` (Auth admin) | `auth.app(id)` |
| `app_slug` (Auth consumer) | `auth.consumer(slug)`, falling back to `PRODUCTCRAFT_AUTH_APP` |

Platform-auth uses `{workspace_slug}` where products use `{workspace_id}`. That is not bound: platform calls take the slug positionally (`platform.workspaces.retrieve("acme")`). Platform-auth/021 documents it.

### 3.4 TypeScript casing (decided)

- **Request and response fields stay snake_case, exactly as on the wire**, matching the docs, the curl tabs and the webhook payloads. No runtime re-casing. Stripe does the same.
- **Positional path arguments and client options are camelCase** (`retrieve(jobId)`, `{ workspaceId, maxRetries }`).
- Auth 0.x camelCased path and query parameters (`paramsCasing` in `kubb.config.ts`). Auth 1.0 drops that, so there is one casing rule across all packages. The migration guide lists the affected query fields.

## 4. The shared runtime contract (`@productcraft/core`)

Written by hand once (about 400 lines). Every generated method calls `this._client.request(spec)`. Nothing per-endpoint lives here.

| Concern | Behaviour |
|---|---|
| Transport | Global `fetch` (Node 18+, Bun, Deno, edge). `fetch` option for custom transports. No runtime dependencies besides `openapi-fetch`, which `.client` needs. |
| Auth | `Authorization: Bearer <apiKey or token>`, or `Cookie: auth_token=`; environment fallback as today (`resolveAuth`). |
| Return values | A method resolves to the parsed body (`data` directly; 204 resolves to `void`). Non-2xx throws. |
| `APIPromise` | `.withResponse()` resolves to `{ data, response, requestId }`; `.asResponse()` resolves to the raw `Response`. |
| Pagination | Ops marked `paginated` return `PagePromise<Item>`. `await` gives a `Page` (`data`, `has_more`, `next_cursor`, `hasNextPage()`, `getNextPage()`). `for await` iterates items across pages. `.toArray({ limit })` collects up to a hard cap (required, so nobody accidentally drains a 1M-row list). |
| Idempotency | When the spec declares an `Idempotency-Key` header on the op, the runtime generates `pc_<uuidv4>` once per call and reuses it on every retry. `options.idempotencyKey` overrides it. Ops without the declared header never get one (no needless CORS preflights on browser consumer routes). |
| Retries | Default `maxRetries: 2`. Retried: network errors, 408, 409 with `code: "LOCK_TIMEOUT"`, 429, 500, 502, 503, 504. Not retried: POST or PATCH without an idempotency key (except connection errors raised before any byte was sent). Backoff: `min(8s, 0.5s * 2^n)` with full jitter. A `Retry-After` header (seconds or HTTP date) or `retry-after-ms` overrides the backoff when it is 60 s or less; above that we fail fast with `RateLimitError`. |
| Timeouts | Default 60 s per attempt, `timeout` option on client and per request. Each attempt gets an `AbortSignal.any([userSignal, timeoutSignal])`. A timeout throws `APITimeoutError`; a caller abort throws `APIUserAbortError`. |
| Errors | `ProductCraftError` is the base class. `APIError` adds `status`, `code` (the envelope's `code`), `message` (string; arrays are joined), `requestId` (`X-Request-Id` header, else the envelope's `request_id`), `headers` and `body`. Subclasses by status: `BadRequestError` 400, `AuthenticationError` 401, `PermissionDeniedError` 403, `NotFoundError` 404, `ConflictError` 409 (`IdempotencyKeyReuseError` when `code === "IDEMPOTENCY_KEY_REUSE"`), `UnprocessableEntityError` 422, `RateLimitError` 429 (`retryAfter`), `InternalServerError` 5xx. Plus `APIConnectionError`, `APITimeoutError`, `APIUserAbortError`. Each product re-exports them. `code` is typed as the API's open enum (`MailErrorCode \| (string & {})`). |
| Per-request options | `{ idempotencyKey, timeout, maxRetries, headers, signal, workspaceId, fetch }`, always the last argument. |
| Headers we send | `User-Agent: productcraft-node/<pkg>@<version> node/<ver>`, `X-PC-SDK-Retry-Count` on retries. |
| Logging | `logLevel: "off" \| "warn" \| "debug"` (env `PRODUCTCRAFT_LOG`). Debug logs method, path, status, request id and attempt; never headers or bodies. |
| Webhooks | `verifyWebhook({ payload, headers, secret, toleranceSeconds = 300 })`. It verifies Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_` secrets, several `v1,` signatures for rotation) and the legacy `X-<Product>-Signature: t=…,v1=<hex>` scheme (still used by the Auth audit sink). It uses `crypto.subtle` (works on edge runtimes), compares in constant time, and throws `WebhookVerificationError`. |
| Escape hatch | `.client` stays on every product: `openapi-fetch` over the same `paths`, sharing auth and base URL but not retries. |

**Bundle and module rules:** dual ESM + CJS via tsup, `sideEffects: false`, no class-field namespace instantiation at import time (resource classes are created lazily on first property access), no bare `require` (memory `feedback_tsup_esm_bare_require`). CI smoke-tests the built `dist` from a real ESM and a real CJS consumer. Size budget: core 6 KB gzip; Mail generated surface 12 KB gzip.

## 5. Generator decision

**Decision: an in-house template generator (`scripts/gen-sdk.mjs`) over `openapi-typescript` types, for every package, Auth included. kubb is retired.**

Prototyped on the live Mail spec (scratch: `work/sdk-dx-2026-11/proto/`):

| | Namespaces and verbs | Shared runtime | gzip, whole Mail | Deterministic | Verdict |
|---|---|---|---|---|---|
| **In-house** (about 200 lines of generator + about 400 lines of runtime) | nested from `x-pc-sdk` | ours, written once | 4.4 KB | yes | **chosen** |
| hey-api 0.99 | nests by operationId | none; module-singleton client | 8.3 KB | yes | 0.x config churn; body wrapped as `sendTemplateDto`; class names `Segments2` shift as the spec grows |
| kubb 4.37 | one level only | none | 3.3 KB | yes | deeper nesting needs a custom kubb plugin, which is more work than the in-house option |
| Fern (OSS, Docker) | flattened, mis-cased (`dnsrecordsApply`) | yes | 18.3 KB | n/a | needs `x-fern-*` in our specs (lock-in); vendors about 1.7k lines of core per package; 4.8 GB Docker image |
| OpenAPI Generator | one class per tag, `xxxRaw` | none | n/a | n/a | needs a JVM; not idiomatic TS |

Reasons:

1. **Our specs are uniform.** One pagination shape, one error envelope, one webhook scheme, one idempotency header. A generic generator spends its complexity on variety we do not have.
2. **Naming comes from `x-pc-sdk`.** No off-the-shelf generator reads it without plugins, and the plugins cost more than the generator.
3. **Runtime features (retries, idempotency, pagination, errors) belong in one hand-written core**, not in N copies of vendored code.
4. **Types stay `openapi-typescript`**, which `.client` already uses. One type source means `.client` and the resource methods can never disagree.

Generator rules:

- Input: `Specs/<surface>.json` only. Output: `packages/<surface>/src/_generated/` (gitignored, like today), containing `paths.d.ts` (openapi-typescript run with `--default-non-nullable false --empty-objects-unknown --enum --export-type`), `resources.ts`, `types.ts` (named `Params`, `Response` and `Item` aliases plus named schemas), `webhooks.ts` (event union from `x-webhooks`), `errors.ts` (error code enum from `x-pc-error-codes`) and `manifest.json`.
- **Deterministic:** sorted keys, no timestamps, no absolute paths. CI runs codegen twice and diffs, and runs it once more against the committed `Specs/` and fails on any diff in the committed `api.md` (section 8).
- **Fails loudly:** a missing `x-pc-sdk`, a name collision, an unresolvable `$ref` or a `Record<string, never>` in a request body exits non-zero with the operation named.
- JSDoc per method: summary, description, `@param` per path argument from parameter descriptions, `@throws` per documented error status, `@see` with the HTTP route and the docs URL, `@deprecated` from the spec.

## 6. What stays hand-written, and why

| Hand-written | Why the generator cannot do it |
|---|---|
| `packages/core/src/**` (runtime, errors, pagination, webhooks verify) | Shared behaviour, not per endpoint. |
| `scripts/gen-sdk.mjs` and its templates | The generator itself. |
| Per-package `src/index.ts`: about 30 lines that import the generated root resource, set the default base URL and bind scopes | Product identity (class name, base URL, scope accessors). |
| Auth `verifyToken` (JWKS cache, issuer and audience pinning, refresh-token refusal, the JWT error hierarchy), passkey ceremony helpers (`passkeys.enroll/signIn/stepUp/completeMfaChallenge`), `oauth.clientCredentials` convenience, `auth-passport` | Client-side cryptography and browser ceremonies that are not HTTP calls. |
| Auth compat aliases (`auth.sendVerificationEmail`, `me.getProfile`, …) | A short generated-from-table alias file kept for one major so existing callers do not break (section 7). |
| `umbrella/src/index.ts` | Composes the products. |

Everything else (every method, param type, JSDoc, README reference section and example) is generated. Adding an endpoint is a monorepo change plus a spec refresh, with zero SDK edits.

## 7. Versioning and migration

- **Majors where behaviour changes:** methods now throw instead of returning `{ data, error }`, and Auth's casing changes.

| Package | Now | Target | Breaking for |
|---|---|---|---|
| `@productcraft/core` | 0.3.0 | 1.0.0 | Direct importers of `makeClient` (kept, deprecated) |
| `@productcraft/mail`, `waitlist`, `trawl`, `platform-auth` | 0.2.0 / 0.2.0 / 0.2.0 / 0.1.0 | 1.0.0 | Nobody using `.client` (kept); new surface is additive |
| `@productcraft/social` | 1.0.0 | 2.0.0 | Same; major because 1.x was already declared stable |
| `@productcraft/auth` | 0.8.0 | 1.0.0 | Query and path casing; `getProfile`/`signup` now typed; `AuthHttpError` becomes an alias of `APIError` |
| `@productcraft/auth-passport` | 0.3.0 | 1.0.0 | Peer range moves to auth ^1 |
| `productcraft` | 0.3.0 | 1.0.0 | `apiKey` shorthand added; `overrides` kept |

- **Pre-release channel:** while the program runs, `main` is in changesets pre mode (`pnpm changeset pre enter next`). Each package task publishes `x.0.0-next.N` under the `next` dist-tag through `release.yml` (trusted publishing, as always). Consumers migrate and verify against `next`. The release task exits pre mode and publishes stable.
- **Compatibility guarantees for 1.x:**
  - `.client` stays on every product, typed by the same `paths`.
  - Auth keeps every scope method name and error class name that exists in 0.8.0. Where the generated name differs (`me.getProfile` versus `me.retrieve`), the old name is an alias tagged `@deprecated`, kept for the life of 1.x and removed in 2.0.
  - Package names never change (the console's install line hard-codes them).
- **After 1.0:** a spec refresh that only adds operations or optional fields is a minor; removing or renaming anything in the spec is a major, and the spec-refresh job labels it as such (it diffs `manifest.json`).
- **Migration guides:** `docs/migrations/<package>-<from>-to-<to>.md`, written per major in the package's task, with a before/after table of every call shape in our own docs and consumers. Linked from the changeset text and the generated README.

## 8. Docs generation

Generated per package on every codegen, checked in, and CI-verified:

- `packages/<p>/api.md`: the full reference. One section per resource, with every method, its signature, route, description and the param and response type names (Stripe's `api.md` pattern).
- `packages/<p>/README.md`: a hand-written intro block (install, construct, three headline calls), then the generated sections: resource index, pagination, errors, retries, idempotency, webhooks, raw response and the `.client` escape hatch. The generator only owns the region between the `<!-- generated:start -->` and `<!-- generated:end -->` markers.
- `examples/<p>/*.ts`: one runnable example per resource, built from spec `example` values. CI typechecks every code block in every README, `api.md` and example against the built packages (`scripts/check-snippets.mjs`), so a README that does not compile fails CI.
- `manifest.json` (shipped in the npm package): `operationId` mapped to `{ resource, method, signature, snippet }`. The productcraft.co API-reference renderer reads it to show a "Node" tab per operation next to curl, so the website reference stays generated too (monorepo productcraft-co/227).

## 9. API-side requirements (the spec work that comes first)

The SDK can only be as good as the spec. These land in the monorepo before the generator depends on them (section 11, steps 1 to 7):

1. `x-pc-sdk` on every operation (naming, scope binding, pagination, exclusions).
2. `X-Request-Id` echoed on every response (taken from the request if present, otherwise generated) and `request_id` in every error envelope; one shared `ErrorResponseDto` with `message: string`; error codes as an open enum plus per-response `x-pc-error-codes`.
3. `Idempotency-Key` declared exactly where `IdempotencyInterceptor` honours it, and honoured on every create-type POST.
4. 429 with `Retry-After` and `X-RateLimit-*` documented on every operation (Mail's `documentRateLimits` moved into a lib).
5. Free-form objects declared `additionalProperties: true` (or typed properly); `type: integer` on `limit`; discriminators on `oneOf` results; `format: uuid` and `format: date-time` where applicable.
6. Webhook event payloads as named schemas, an `x-webhooks` map and a `WebhookEventType` enum, generated from `defineCatalogue`.
7. `.addServer()` and tag descriptions on every API; the Social mis-attached decorators (`post.controller.ts:415-421`) fixed; Platform's `oneOf [envelope, array]` API-key list reduced to the envelope on a versioned path.

## 10. CI

- `ci.yml`: install, refresh-free codegen, determinism check (codegen twice, diff), lint, build, unit tests, a runtime contract test suite against a local mock server (retries, Retry-After, idempotency key reuse, pagination, timeouts, error mapping, webhooks vectors), ESM and CJS smoke against `dist`, snippet typecheck, and a size budget.
- `spec-refresh.yml`: pushes with a GitHub App token (or a fine-grained PAT) so CI actually runs on its PRs; opens one PR with a changeset per changed surface, labelled `breaking` when `manifest.json` lost or renamed anything.
- `release.yml`: unchanged trust model (OIDC trusted publishing, `npm@11`), plus pre-mode support for `next`.

## 11. Build order

Spec fixes first, each deployed and the spec refreshed; then the runtime; then the generator; then one task per product; then the umbrella, docs, consumers and releases.

| # | Repo | Task |
|---|---|---|
| 1 | monorepo | `tasks/monorepo/020-request-id-and-shared-error-envelope.md` |
| 2 | monorepo | `tasks/monorepo/021-openapi-sdk-conventions-lib.md` (`x-pc-sdk`, rate-limit and uuid helpers, audit rules) |
| 3 | monorepo | `tasks/monorepo/022-typed-webhook-event-schemas.md` |
| 4 | monorepo | `tasks/trawl-api/005-sdk-grade-openapi.md` (smallest API, proves the libs) |
| 5 | monorepo | `tasks/mail-api/063-sdk-grade-openapi.md` |
| 6 | monorepo | `tasks/waitlist-api/008-sdk-grade-openapi.md` |
| 7 | monorepo | `tasks/platform-auth-api/021-sdk-grade-openapi.md` |
| 8 | monorepo | `tasks/social-api/045-sdk-grade-openapi.md` |
| 9 | monorepo | `tasks/users-api/096-sdk-grade-openapi.md` |
| 10 | sdk-node | `tasks/001-spec-refresh-runs-ci.md` (can start in parallel with 1) |
| 11 | sdk-node | `tasks/002-core-runtime.md` |
| 12 | sdk-node | `tasks/003-generator-pipeline.md` |
| 13 | sdk-node | `tasks/004-trawl-generated.md` |
| 14 | sdk-node | `tasks/005-mail-generated.md` |
| 15 | sdk-node | `tasks/006-waitlist-generated.md` |
| 16 | sdk-node | `tasks/007-platform-auth-generated.md` |
| 17 | sdk-node | `tasks/008-social-generated.md` |
| 18 | sdk-node | `tasks/009-auth-on-the-pipeline.md` |
| 19 | sdk-node | `tasks/010-umbrella.md` |
| 20 | sdk-node | `tasks/011-generated-docs-and-reference.md` |
| 21 | monorepo | `tasks/console/086-sdk-quickstarts-on-generated-sdks.md` |
| 22 | monorepo | `tasks/productcraft-co/227-docs-on-generated-sdks.md` |
| 23 | sdk-node | `tasks/012-stable-release.md` |

Fix now, outside the order: `tasks/console/085-social-quickstart-community-id.md`. The console's Social quickstart does not compile against social 1.0.0.

Not filed: conquer-services, WriteWave and dispute.markets do not have to change. `.client`, the Auth scope names and the error class names all survive, and their pins (`^0.6.0`, `^1.0.0`) will not pull a major. Moving them to the new surface is optional follow-up work, listed in each migration guide.

`monorepo/tasks/mail-api/020-sdk-and-cli-parity.md` is superseded for its Node part by this program. Its Python, Go and CLI parts stay open and should reuse `x-pc-sdk` and `manifest.json`.

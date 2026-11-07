# The ProductCraft Node SDK standard

Status: program complete (2026-11-07): every package is on the generator and at a stable 1.x. Adopted 2026-11-05, revised 2026-11-06 after two design reviews (section 13 records what changed and what was rejected). Owner: the SDK maintainer (`clauderanelagh`). This document is the contract every `@productcraft/*` package is built to. The ordered work that gets us there lives in `tasks/` (this repo) and in `tasks/<app>/` in the monorepo; section 11 lists it.

## 1. Why this exists

Robert, 2026-11-06: "Auth has a nicely made interface with good Stripe-like DX while the others look like light fetch wrappers. They should have a high standard like Stripe, ideally generated automatically from the specs the APIs publish."

What we found (four read-only audits, 2026-11-05):

- **Mail, Waitlist, Social, Trawl and Platform-auth never got past v0.** Each is `openapi-typescript` types plus a class that exposes `.client` (raw `openapi-fetch`). Callers write URL strings and unpack `{ data, error }`. The "ergonomic wrappers in v0.1+" promised in `CLAUDE.md` never shipped.
- **Auth's good DX is mostly hand-written.** About 1,000 lines in `packages/auth/src/scopes/` sit over kubb functions named after controllers (`appControllerCloneApp`). They cover 62 to 73 of 224 operations. `client` is private, so the remaining two thirds of Auth are unreachable from the SDK.
- **No package has** retries, timeouts, auto-pagination, automatic `Idempotency-Key`, typed error classes, request IDs, raw-response access or webhook verification.
- **Spec and generator defects leak into types.** 67 free-form objects generate as `Record<string, never>`, which makes Mail's flagship `templates/{name}/send` untypeable. Several README quick-starts do not compile.
- **The vendored specs are stale.** The nightly refresh PR (#95) has been open since 10-25 because bot pushes with `GITHUB_TOKEN` never trigger CI.

## 2. The target, by example

The bar is the Stripe Node SDK (and Resend, Clerk and OpenAI where they do better): resources and verbs you can guess, everything typed, failures you can catch by class, and plumbing (retries, idempotency, pagination, polling, webhook verification) you never write.

IDs in our APIs are UUIDs (only Auth's `tak_`/`tnt_` keys are prefixed); the examples use them as they are.

### 2.1 Constructing clients

```ts
import { ProductCraft } from "productcraft";

// Umbrella: one key, every product. The key falls back to PRODUCTCRAFT_API_KEY.
const pc = new ProductCraft({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: "9b2f6c1e-…" });

// Or one product at a time (smaller install, same API).
import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey, workspaceId: "9b2f6c1e-…", maxRetries: 3, timeout: 20_000 });
```

`apiKey` is the new shorthand. `auth: { type: "apiKey" | "bearer" | "cookie", ... }` (today's `PCAuth`) keeps working for bearer and cookie credentials.

`workspaceId` is optional for workspace API keys, and passing it is recommended. Without it the client resolves it once per process from platform-auth `GET /v1/api-keys/self` (its own 5 s timeout, cached as a shared promise, also read from `PRODUCTCRAFT_WORKSPACE_ID`). That costs one extra request to another host on a cold start; the README says so. Bearer and cookie credentials can span workspaces, so they never auto-resolve: a missing `workspaceId` throws `ConfigurationError("pass workspaceId")`, as does a failed lookup.

A workspace key used in a browser throws unless `dangerouslyAllowBrowser: true` is set (the OpenAI pattern). Keyless routes (Waitlist public submit, Auth consumer routes) are browser-legitimate and need no key and no flag.

### 2.2 Per product

```ts
// Mail
await mail.emails.send({ from: "Acme <hi@mail.acme.com>", to: "success@simulator.amazonses.com", subject: "Hi", html: "<p>Hi</p>" });
await mail.templates.send("welcome", { to: "ada@example.com", data: { first_name: "Ada" } });
for await (const message of mail.messages.list({ status: ["bounced"] })) { … }   // plain string literals
const domain = await mail.domains.create({ name: "mail.example.com" });
await mail.domains.verify(domain.id);
const ready = await mail.domains.poll(domain.id, { timeoutMs: 600_000 });   // waits for a terminal status
await mail.messages.erase({ recipient: "ada@example.com" });                  // bulk GDPR erase, not "delete one"

// Waitlist
const list = await waitlist.lists.create({ display_name: "Beta", slug: "beta" });
for await (const entry of waitlist.lists.entries.list(list.id)) { … }
const pub = new Waitlist().public({ workspace: "acme", waitlist: "beta" });     // no key, browser-safe
await pub.entries.create({ email: "ada@example.com", name: "Ada Lovelace" });

// Trawl
type Tiers = { tiers: { name: string; price: string }[] };
const job = await trawl.jobs.createAndPoll<Tiers>({ description: "Pricing tiers", json_schema: schema, suggested_urls: ["https://…"] });
job.result?.tiers[0].name;                                                     // typed by the generic
await trawl.jobs.cancel(job.id);

// Social: community-scoped resources hang off a bound scope; .as(actorId) fills actor_id
const community = social.community("3f0c…").as(actorId);
const post = await community.posts.create({ body: "Hello" });
await community.posts.comments.create(post.id, { body: "First!" });
const page = await community.posts.list({ limit: 50 });                        // one page, typed
const recent = await community.posts.list().toArray({ maxItems: 500 });

// Platform
const me = await platform.apiKeys.self();
const ws = await platform.workspaces.retrieve("acme");

// Auth
const session = await auth.consumer("my-app").signin({ email, password });     // 0.x `.auth.signin` kept as an alias
const users = auth.admin.app("5d1e…").endUsers.list({ limit: 100 });           // admin scope named by audience
for await (const u of users) { … }
const claims = await auth.verifyToken(jwt, { app: "my-app" });                  // top level; hand-written
```

Types are public and named like Stripe's, exported as a namespace per product:

```ts
import type { Mail, Trawl } from "productcraft";
const params: Mail.DomainCreateParams = { name: "mail.example.com" };
function show(d: Mail.Domain) { … }
let j: Trawl.Job;
```

### 2.3 Cross-cutting behaviour

```ts
// Per-request options: always the last argument. A list with no params takes {} first.
await mail.templates.send("welcome", body, {
  idempotencyKey: "order-1234-welcome",   // overrides the automatic key
  timeout: 5_000,
  maxRetries: 0,
  headers: { "X-Trace": "abc" },
  signal: controller.signal,
});
await mail.domains.list({}, { timeout: 5_000 });

// Request id on every returned object, no extra call needed.
const d = await mail.domains.retrieve(id);
d.lastResponse.requestId;                    // non-enumerable, never serialised

// Raw response when you need headers.
const { data, response, requestId, rateLimit } = await mail.domains.list().withResponse();

// Errors are classes you can catch, across ESM/CJS and duplicate installs.
try {
  await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof BadRequestError) err.errors.forEach(e => console.log(e.param, e.message));
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else throw err;
}

// Webhooks: one object-shaped verifier; secret from config or env; Node or Fetch headers.
const event = await mail.webhooks.unwrap({ payload: rawBody, headers: req.headers });
switch (event.type) {
  case "email.bounced": event.data.recipient; break;   // narrowed
  default: /* UnknownWebhookEvent: new types never break the switch */
}

// Escape hatch: unchanged, still typed, always available.
const { data: raw } = await mail.client.GET("/v1/workspaces/{workspace_id}/messages", { params: { path: { workspace_id } } });
```

## 3. Naming rules

Names are decided **in the spec, by the API**, and both the SDK generator and the MCP server read them. The SDK never keeps its own rename table (the one exception is the generated Auth compat file, section 6, deleted in 2.0).

### 3.1 The `x-pc-sdk` extension

Every operation in every public `/docs-json` carries:

```json
"x-pc-sdk": { "resource": "posts.comments", "method": "create", "bind": ["community_id"], "paginated": true }
```

or `"x-pc-sdk": false` for routes that are not API calls (browser redirects, HTML pages, OAuth callbacks, avatar image GETs) and for deprecated legacy webhook routes. Optional keys: `poll` (on a retrieve op: `{ "field": "status", "terminal": ["completed", "failed", "cancelled"] }`, which generates `poll(id)` and, where a create exists, `createAndPoll`; an optional `"result": "<property>"` names a free-form object property of the response, and makes both helpers generic so `createAndPoll<T>` types that property as `T`) and `public: true` (no auth header, browser-safe). An empty `resource` (`"resource": ""`, `@SdkMethod('', 'signin')`) puts the method on the root of the bound scope where a resource would only stutter (`auth.consumer(slug).signin()`); it is only valid with a non-empty `bind` (users-api/096).

Component schemas carry `x-pc-sdk-model: "Domain"` (derived by stripping `ResponseDto`/`Dto`, overridable with `@SdkModel`). It is the public type name; Nest class names never reach users.

- **It is computed, not hand-typed.** A shared monorepo helper (`libs/openapi-sdk-nestjs`, task monorepo/021) walks the Nest document after `SwaggerModule.createDocument` and derives defaults with the rules below. `@SdkMethod("contacts.properties", "list")` overrides where the default reads badly, `@SdkExclude()` sets `false`.
- **operationIds are not renamed.** The MCP server's curation and send-guard key on them (`apps/mcp-server/src/tools/send-guard.service.ts`, `generator/curation.ts`). They stay as stable internal IDs.
- **`libs/openapi-audit` enforces it.** Missing `x-pc-sdk`, a duplicate `resource.method` within one API, a reserved word, or a clash with a hand-written name (3.5) fails the API's test suite.
- **Names are snapshotted on the API side.** openapi-audit writes `apps/<api>/sdk-names.snapshot.json` (`operationId` to `resource.method`, plus the model names). A route refactor that changes a public name fails the API's test until the snapshot is updated in the same PR, so renames are deliberate, not discovered by the nightly refresh after a hand deploy.

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
| `GET /things/<segment>` or `GET /things/{id}/<segment>` where `<segment>` is not a collection | a method named after the segment (`entries.count()`, `messages.timeline()`, `templates.variables(name)`, `domains.lookup()`, `messages.body(id)`, `messages.raw(id)`) |
| `GET /things/export.csv`, `GET …/export` | `export` (returns a `Response`, section 4) |
| `PATCH /things/{id}/<field>` | `update<Field>` on the parent (`waitlists/{id}/status` becomes `lists.updateStatus(id)`) |
| `DELETE /things` (no id; bulk or filtered) | **no default.** The audit fails until `@SdkMethod` names it (`messages.erase({ recipient })`). |

4. Verb vocabulary is closed: `list, create, retrieve, update, delete, search, send, cancel, verify, export, erase` plus action verbs taken from the path and segment methods from the rule above. `remove`, `get`, `show`, `fire`, `getById`, `upsert`, `put` and `submit` never appear as SDK methods.
5. Collisions fail the build (generator and audit). The 2026-11-05 dry run found 4 collisions across 756 operations, each fixed with `@SdkMethod`.
6. A resource may be renamed at the product root where the default stutters: Waitlist's `waitlists.*` becomes `lists.*` (`@SdkMethod`), Mail's call-level send is `emails.*` (section 9.8).

### 3.3 Scopes (`bind`)

`bind` lists the path parameters the client supplies instead of the caller:

| Parameter | How it is bound |
|---|---|
| `workspace_id` (Mail, Waitlist, Trawl, Platform stats) | client default (`workspaceId` option, environment, or `/v1/api-keys/self` for workspace keys, section 2.1); overridable per request via `options.workspaceId` (needed for bearer tokens that span workspaces) |
| `community_id` (Social) | `social.community(id)` returns a scope object; `.as(actorId)` on it fills `actor_id` in any body or query that declares it, unless the call passes one |
| `app_id` (Auth admin) | `auth.admin.app(id)` (`auth.app(id)` kept as an alias) |
| `app_slug` (Auth consumer) | `auth.consumer(slug)`, falling back to `PRODUCTCRAFT_AUTH_APP` |
| `workspace_slug` + `waitlist_slug` (Waitlist public) | `waitlist.public({ workspace, waitlist })`, named fields so the two slugs cannot be swapped |

Platform-auth uses `{workspace_slug}` where products use `{workspace_id}`. That is not bound: platform calls take the slug positionally (`platform.workspaces.retrieve("acme")`). Platform-auth/021 documents it.

### 3.4 TypeScript casing and types (decided)

- **Request and response fields stay snake_case, exactly as on the wire**, matching the docs, the curl tabs and the webhook payloads. No runtime re-casing. Stripe does the same.
- **Positional path arguments, client options and type names are camelCase/PascalCase** (`retrieve(jobId)`, `{ workspaceId, maxRetries }`, `Mail.DomainCreateParams`).
- **Enums are string-literal unions, never TS `enum`s.** Request enums are closed (`"bounced" | "delivered"`); response enums are open (`"bounced" | "delivered" | (string & {})`) so a new server value is not a type lie. Value arrays are exported as consts (`Mail.MessageStatus.values`). Webhook event unions end in `UnknownWebhookEvent`; the union `webhooks.unwrap` returns is `<Product>.UnwrapWebhookEvent` (APIs already use `WebhookEvent` for their stored-event model).
- **Defaults:** a field with a `default` is optional in the request type and required in the response type. Response DTOs must declare `required` (openapi-audit rule, monorepo/021).
- **Type names:** `<Model>` for response objects (from `x-pc-sdk-model`), `<Resource><Method>Params` for request params (`Mail.EmailListParams`), `<Resource><Method>Response` only where the response is not a model. A renamed or removed public type is a breaking change and shows in the API report diff (section 10).
- Auth 0.x camelCased path and query parameters (`paramsCasing` in `kubb.config.ts`). Auth 1.0 drops that, so there is one casing rule across all packages. The migration guide lists the affected query fields.

### 3.5 Names reserved by hand-written code

Generated names must not use: `client`, `withResponse`, `asResponse`, `lastResponse`, `as`, `public`, `community`, `app`, `admin`, `consumer`, `verifyToken`, `poll`, `createAndPoll`, and `unwrap` inside a `webhooks` namespace. The generator and the audit fail on a clash.

Per scope, a product's hand-written code may own more names (SURFACES `members` in `scripts/gen-sdk.mjs`); the generator fails when a generated resource or method on that scope's root uses one. Auth's consumer scope owns `verifyToken`, `jwks`, `passkeys`, `appSlug`, `expectedIssuer`, `expectedAudience` and `acceptedIssuers` (0.8 names), so its discovery routes are `consumer(slug).wellKnown.jwks()` and `wellKnown.openidConfiguration()` (users-api, monorepo #1120), as in Platform.

## 4. The shared runtime contract (`@productcraft/core`)

Written by hand once. Every generated method calls `this._client.request(spec)`. Nothing per-endpoint lives here.

| Concern | Behaviour |
|---|---|
| Runtimes | **Node 20.3+** (`engines: ">=20.3"` in every package; Node 18 is end-of-life and lacks `AbortSignal.any` and an unflagged global `crypto`), Bun, Deno, edge. CI smoke-tests the built `dist` on Node 20, 22 and 24. |
| Transport | Global `fetch`; `fetch` option for custom transports (also the hook point for tracing). No runtime dependencies besides `openapi-fetch`, which `.client` needs. |
| Auth | `Authorization: Bearer <apiKey or token>`, or `Cookie: auth_token=`; environment fallback as today (`resolveAuth`). Browser guard per section 2.1. |
| Return values | A JSON method resolves to the parsed body; 204 resolves to `void`. Ops whose success content type is not JSON (CSV and zone exports, raw MIME, attachments, message bodies) resolve to the raw `Response` (`.text()`, `.arrayBuffer()`, `.body` stream); the generator reads the content type and never JSON-parses them. Non-2xx throws. Every returned object carries a non-enumerable `lastResponse: { requestId, status, headers }`. |
| `APIPromise` | `.withResponse()` resolves to `{ data, response, requestId, rateLimit }` (`rateLimit` parsed from `X-RateLimit-*`); `.asResponse()` resolves to the raw `Response`. |
| Pagination | Ops marked `paginated` return `PagePromise<Item>`. `await` gives a `Page` (`data`, `has_more`, `next_cursor`, `hasNextPage()`, `getNextPage()`). `for await` iterates items across pages; `.pages()` iterates pages. `.toArray({ maxItems })` collects up to a required cap (`limit` keeps meaning page size). |
| Polling | Ops with `x-pc-sdk.poll` get `poll(id, { intervalMs = 2_000, timeoutMs = 300_000, signal })`, resolving when the field reaches a terminal value, plus `createAndPoll(params, pollOptions)` where a create exists. Polls respect `Retry-After`. Passing `timeoutMs` throws `APITimeoutError`; an abort throws `APIUserAbortError`. `createAndPoll` sends the create's idempotency key on the create only. |
| Idempotency | When the spec declares an `Idempotency-Key` header on the op, the runtime generates `pc_<uuidv4>` once per call and reuses it on every retry. `options.idempotencyKey` overrides it. Ops without the declared header never get one (no needless CORS preflights on browser consumer routes). |
| Retries | Default `maxRetries: 2`. Retried: network errors, 408, 409 with `code: "IDEMPOTENCY_IN_PROGRESS"`, 429, 500, 502, 503, 504. **A POST or PATCH without an idempotency key is never retried**, not even on connection errors (`fetch` cannot tell whether bytes were sent). GET, PUT and DELETE are. Backoff: `min(8s, 0.5s * 2^n)` with full jitter. A `Retry-After` header (seconds or HTTP date) or `retry-after-ms` overrides the backoff when it is 60 s or less; above that we fail fast with `RateLimitError`. |
| Idempotency on the server | The SDK relies on monorepo/021's change: a request that finds the key locked returns `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After` instead of executing again. When Redis is unavailable the server still runs the request without idempotency (fail-open, a deliberate availability choice, documented in the README's idempotency section); a retry during a Redis outage can therefore execute twice. |
| Timeouts | Default 60 s per attempt, `timeout` option on client and per request. Each attempt gets `AbortSignal.any([userSignal, timeoutSignal])`. Worst case with defaults is about 3 attempts x 60 s plus backoff (about 3 minutes); the README states it and shows `signal: AbortSignal.timeout(ms)` for an overall deadline. A timeout throws `APITimeoutError`; a caller abort throws `APIUserAbortError`. |
| Errors | `ProductCraftError` is the base class. `APIError` adds `status`, `code` (the envelope's `code`), `message` (string; an array `message` is joined), `errors` (`{ param, message, code }[]` from the envelope's `errors`, empty when absent), `details` (the envelope's route-specific `details` object, e.g. `{ fqdn, reason }`), `docUrl` (`https://productcraft.co/docs/errors#<code>`), `requestId` (`X-Request-Id` header, else the envelope's `request_id`), `headers` and `body`. Subclasses by status: `BadRequestError` 400, `AuthenticationError` 401, `PermissionDeniedError` 403, `NotFoundError` 404, `ConflictError` 409 (`IdempotencyKeyReuseError` when `code === "IDEMPOTENCY_KEY_REUSE"`), `UnprocessableEntityError` 422, `RateLimitError` 429 (`retryAfter`, in seconds), `InternalServerError` 5xx. Plus `APIConnectionError`, `APITimeoutError`, `APIUserAbortError`, `ConfigurationError`, `WebhookVerificationError`. `code` is typed as the API's open enum (`MailErrorCode \| (string & {})`). Every class is branded with `Symbol.for("productcraft.error.<Name>")` and a `static [Symbol.hasInstance]`, so `instanceof` works across the ESM and CJS builds and across duplicate copies of core. |
| Per-request options | `{ idempotencyKey, timeout, maxRetries, headers, signal, workspaceId, fetch }`, always the last argument. |
| Headers we send | `User-Agent: productcraft-node/<pkg>@<version> node/<ver>`, `X-PC-SDK-Retry-Count` on retries. |
| Logging | `logLevel: "off" \| "warn" \| "debug"` (env `PRODUCTCRAFT_LOG`) and a `logger` option (`{ debug, info, warn, error }`, pino- and console-compatible). Debug logs method, path, status, request id and attempt; never headers or bodies. |
| Webhooks | `verifyWebhook({ payload, headers, secret, toleranceSeconds = 300 })` and `<product>.webhooks.unwrap({ payload, headers, secret? })` share one object shape. `secret` is a string or an array (Mail has default, per-domain and endpoint secrets); when omitted it comes from the client's `webhookSecret` or `PRODUCTCRAFT_<PRODUCT>_WEBHOOK_SECRET`. `headers` accepts Node `IncomingHttpHeaders` or Fetch `Headers`. Verifies Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`, `whsec_` secrets, several `v1,` signatures for rotation) and the legacy `X-<Product>-Signature: t=…,v1=<hex>` scheme (Auth audit sink). Uses `crypto.subtle`, compares in constant time, throws `WebhookVerificationError`, and resolves to the parsed JSON payload. A raw payload is required (a parsed object throws). |
| Escape hatch | `.client` stays on every product: `openapi-fetch` over the same `paths`, sharing auth and base URL but not retries. Built with `createOpenAPIClient<paths>(apiClient)`, a standalone function in core, so a bundle of core alone leaves openapi-fetch out. Every generated product class has a `get client()` that calls it, and bundlers keep class members, so openapi-fetch (about 2 KB gzip) is in every product bundle whether or not `.client` is touched. That is the price of keeping `.client` through 1.x; moving it behind a separate entry is a 2.0 change. `makeClient` stays exported, deprecated. |

**Bundle and module rules:** dual ESM + CJS via tsup, each format with its own declarations: every `exports` entry (subpaths included) nests `types` under `import` (`.d.ts`) and `require` (`.d.cts`), and a `typesVersions` entry maps `/testing` for node10 resolution, which ignores `exports`. Public declarations never import an ESM-only dependency's types (Auth carries structural copies of the jose types it exposes), `sideEffects: false`, resource classes created lazily on first property access, no bare `require` (memory `feedback_tsup_esm_bare_require`). CI smoke-tests the built `dist` from a real ESM and a real CJS consumer, including one process that loads both builds and checks `instanceof`. Lazy getters keep startup cheap but do not make unused resources tree-shake (bundlers keep class members), so we do not claim per-method tree-shaking. **Size budget** is measured, not asserted: an esbuild bundle of a one-call consumer per package (for example `new Mail().templates.send(…)`), minified and gzipped, with the limit set from the first measurement plus 10% and enforced in CI.

## 5. Generator decision

**Decision: an in-house template generator (`scripts/gen-sdk.mjs`) over `openapi-typescript` types, for every package, Auth included. kubb is retired.**

Prototyped on the live Mail spec (scratch: `work/sdk-dx-2026-11/proto/`):

| | Namespaces and verbs | Shared runtime | gzip, whole Mail | Deterministic | Verdict |
|---|---|---|---|---|---|
| **In-house** | nested from `x-pc-sdk` | ours, written once | 4.4 KB | yes | **chosen** |
| hey-api 0.99 | nests by operationId | none; module-singleton client | 8.3 KB | yes | 0.x config churn; body wrapped as `sendTemplateDto`; class names `Segments2` shift as the spec grows |
| kubb 4.37 | one level only | none | 3.3 KB | yes | deeper nesting needs a custom kubb plugin, which is more work than the in-house option |
| Fern (OSS, Docker) | flattened, mis-cased (`dnsrecordsApply`) | yes | 18.3 KB | n/a | needs `x-fern-*` in our specs (lock-in); vendors about 1.7k lines of core per package; 4.8 GB Docker image |
| OpenAPI Generator | one class per tag, `xxxRaw` | none | n/a | n/a | needs a JVM; not idiomatic TS |

Realistic size: the prototype was about 200 lines of generator and 400 of runtime, without JSDoc, `api.md`, README regions, examples, the manifest, webhooks, polling, testing mocks and the snippet checker. Plan for 1,500 to 2,000 lines of generator plus templates, covered by golden tests.

Reasons:

1. **Our specs are uniform.** One pagination shape, one error envelope, one webhook scheme, one idempotency header. A generic generator spends its complexity on variety we do not have.
2. **Naming comes from `x-pc-sdk`.** No off-the-shelf generator reads it without plugins, and the plugins cost more than the generator.
3. **Runtime features belong in one hand-written core**, not in N copies of vendored code.
4. **Types stay `openapi-typescript`**, which `.client` already uses. One type source means `.client` and the resource methods can never disagree.

Generator rules:

- Input: `Specs/<surface>.json` only. Output: `packages/<surface>/src/_generated/` (gitignored), containing `paths.d.ts` (openapi-typescript, literal unions, no `--enum`, `--empty-objects-unknown`, `--export-type`, `defaultNonNullable: false`; the spec is pre-processed so defaulted fields of response-only schemas become required, per 3.4; enum value arrays come from the generator, not `--enum-values`, which emits runtime consts with path-derived names), `client.ts` (the product class, its scope accessors and the type namespace), `resources.ts`, `types.ts` (the product type namespace, 3.4), `webhooks.ts` (event union from `x-webhooks` plus `UnknownWebhookEvent`), `errors.ts` (error codes from `x-pc-error-codes`), `testing.ts` (section 8) and `manifest.json`.
- **Toolchain pinned exactly** (`openapi-typescript`, `openapi-fetch`, tsup, typescript): a Renovate bump is its own PR whose API report diff shows any type change. This overrides the old CLAUDE.md "don't pin" rule.
- **Deterministic:** sorted keys, no timestamps, no absolute paths. CI runs codegen twice and diffs, and fails on any diff in the committed `api.md`, README region or examples.
- **Fails loudly:** a missing `x-pc-sdk`, a name collision, a reserved-name clash, an unresolvable `$ref` or a `Record<string, never>` in a request body exits non-zero with the operation named. The generator runs only on packages already switched to it; unswitched packages keep the old `openapi-typescript` path, so there is no soft mode.
- JSDoc per method: summary, description, `@param` per path argument, `@throws` per documented error status, `@see` with the HTTP route and the docs URL, `@deprecated` from the spec, and an `@example` with the call shape (including `list({}, { timeout })` for options-only calls).

## 6. What stays hand-written, and why

Hand-written code is limited to an allowlist (`scripts/handwritten-allowlist.json`). CI fails when a file under `packages/*/src` is neither generated nor on the list, and when a per-package `index.ts` exceeds 60 lines.

| Hand-written | Why the generator cannot do it |
|---|---|
| `packages/core/src/**` (runtime, errors, pagination, polling, webhooks verify) | Shared behaviour, not per endpoint. |
| `scripts/gen-sdk.mjs` and its templates | The generator itself. |
| Per-package `src/index.ts` (max 60 lines): re-exports the generated class, errors and `paths`, plus hand-written extras (Auth's `verifyToken`). Product identity (class name, base URL, SDK name, webhook env var, scope accessors) is data in the `SURFACES` table of `scripts/gen-sdk.mjs`, because the class must be declared in the same file as its type namespace. | Re-exports and the few non-HTTP extras. |
| Auth `verifyToken` (JWKS cache, issuer and audience pinning, refresh-token refusal, the JWT error hierarchy), passkey ceremony helpers (`passkeys.enroll/signIn/stepUp/completeMfaChallenge`), `oauth.clientCredentials` convenience, `auth-passport` | Client-side cryptography and browser ceremonies that are not HTTP calls. |
| Auth compat data: `packages/auth/compat.json` (frozen map of 0.6.x and 0.8.0 names to operationIds) | Data, not code: `compat.ts` is generated from it. Kept for the life of Auth 1.x, deleted in 2.0. |
| `umbrella/src/index.ts` | Composes the products. |

Everything else (every method, param type, JSDoc, README reference section, example and test mock) is generated. Adding an endpoint is a monorepo change plus a spec refresh, with zero SDK edits.

## 7. Versioning and releases

There is **no program-wide changesets pre mode**: pre mode applies to the whole repo, and it would hold every spec-refresh patch and 0.x fix back on `next` for weeks. Each package ships stable when its task's live smoke passes.

| Package | Now | Target | When | Breaking for |
|---|---|---|---|---|
| `@productcraft/core` | 0.3.0 | 0.4.0, then 1.0.0 | 002; 012 | Nobody (`makeClient` kept, deprecated); engines move to Node 20.3 |
| `@productcraft/trawl`, `mail`, `waitlist`, `platform-auth` | 0.2.0 / 0.2.0 / 0.2.0 / 0.1.0 | 1.0.0 | 004 to 007, each on its own | Nobody using `.client` (kept); the new surface is additive. 1.0 declares the surface stable. |
| `@productcraft/social` | 1.0.0 | 1.1.0 | 008 | Nobody: resource methods are additive and `.client` is unchanged |
| `@productcraft/auth` | 0.9.0 | 1.0.0 (previews as `next` snapshots) | 009 previews; 012 stable | Query and path casing; `consumer.auth.*` flattened (aliased); `AuthHttpError` becomes an alias of `APIError` |
| `@productcraft/auth-passport` | 0.3.0 | 1.0.0 | 012 | Peer range moves to auth ^1 |
| `productcraft` | 0.3.0 | 0.4.0 as a `next` snapshot, then 1.0.0 | 010 (snapshot); 012 (stable) | `apiKey` shorthand added; `overrides` kept; `pc.platform` added (`pc.platformAuth` kept) |

The engines change to Node 20.3 ships inside these releases (Node 18 and 20 are end-of-life; the changeset text says so).

- **Auth previews** use changesets snapshot releases (`changeset version --snapshot next`, `changeset publish --tag next`) through a `workflow_dispatch` input on `release.yml` itself, because the npm trusted publisher is bound to that filename. Added in 009.
- **Compatibility guarantees for 1.x:**
  - `.client` stays on every product, typed by the same `paths`.
  - Auth keeps every scope method and error class name that exists in 0.8.0 and the 0.6.x names conquer-api and WriteWave call. Where the generated name differs (`me.getProfile` versus `me.retrieve`, `consumer(slug).auth.signin` versus `consumer(slug).signin`), the old name is a generated alias tagged `@deprecated`, removed in 2.0.
  - Package names never change (the console's install line hard-codes them).
- **After 1.0:** a spec refresh that only adds operations or optional fields is a minor. Spec-refresh labels a PR `breaking` when `oasdiff breaking` on `Specs/` or the API report diff (section 10) finds a break; `manifest.json` diffs alone miss type-level breaks.
- **/v1 is additive-only:** response shapes under `/v1` only gain fields and enum values (the open enums in 3.4 absorb that). Written into the monorepo API conventions by monorepo/021. There is no `apiVersion` pin because there is nothing to pin to.
- **Migration guides:** `docs/migrations/<package>-<from>-to-<to>.md`, written per major in the package's task, with a before/after table of every call shape in our own docs and consumers. Old-version blocks use a ` ```ts before ` fence, which the snippet check skips. Linked from the changeset text and the generated README.

## 8. Docs generation

Generated per package on every codegen (task 003 builds all of it), checked in, and CI-verified:

- `packages/<p>/api.md`: the full reference. One section per resource, every method with signature, route, description and the param and response type names, plus the error-code catalogue from `x-pc-error-codes`.
- `packages/<p>/README.md`: a hand-written intro block (install, construct, three headline calls), then generated sections: resource index, pagination, errors, retries and the worst-case timeout, idempotency (including the Redis fail-open note), polling, webhooks with raw-body recipes for Next route handlers, Express (`express.raw`) and Hono, raw responses, testing, and the `.client` escape hatch. The generator owns only the region between `<!-- generated:start -->` and `<!-- generated:end -->`.
- `examples/<p>/*.ts`: one runnable example per top-level resource, built from spec `example` values. `scripts/check-snippets.mjs` typechecks every code block in every README, `api.md`, example and `docs/` file against the built packages (` ```ts before ` blocks and this standard's illustrative examples excluded). A file can declare `<!-- snippet-preamble: … -->` (api.md declares the import and the client) that is prepended to each of its blocks; `express` and `hono` resolve to `any` shims.
- `@productcraft/<p>/testing`: a generated `createMockFetch()` that answers every operation with its spec `example` (overridable per op), so "how do I unit-test code that sends mail" has a one-line answer. No MSW dependency.
- `manifest.json` (shipped in the npm package from the first generated release): `operationId` mapped to `{ resource, method, signature, snippet }`. The productcraft.co API reference reads it to show a "Node" tab per operation next to curl, starting with Trawl (monorepo productcraft-co/227) and growing per product.

## 9. API-side requirements (the spec work)

The SDK can only be as good as the spec. These land in the monorepo, each before the SDK task that depends on it (section 11):

1. `x-pc-sdk` on every operation and `x-pc-sdk-model` on every response schema, with the names snapshot (3.1).
2. `X-Request-Id` echoed on every response (taken from the request if it is a sane token, otherwise generated). The error envelope gains `request_id` and `errors: { param, message, code }[]` (a new key: `details` already carries route-specific objects that clients read, so it keeps its shape); **`message` keeps its current wire shape** (`string | string[]`, declared as such in one shared `ErrorResponseDto`) so non-SDK clients do not break. Error codes as an open enum plus per-response `x-pc-error-codes`. Shipped 2026-11-06 (monorepo/020): the enum is `components.schemas.<Api>ErrorCode` (`anyOf: [{ enum }, { type: string }]`, `x-pc-open-enum: true`, `x-enum-descriptions`), the header `components.headers.RequestId`.
3. `Idempotency-Key` declared exactly where `IdempotencyInterceptor` honours it, and honoured on every create-type POST. That needs per-API scope extractors (the default extractor 400s on routes without `workspaceId`: Auth `app_id`, Social `community_id`, anonymous and consumer routes), a contract test that sends a key to every op declaring the header and asserts no 400, and a lock-wait timeout that returns `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After` instead of executing the handler again (today `libs/idempotency-nestjs` re-executes uncached after 5 s).
4. 429 with `Retry-After` and `X-RateLimit-*` documented on every operation (Mail's `documentRateLimits` moved into a lib).
5. Free-form objects declared `additionalProperties: true` (or typed properly); `type: integer` on `limit`; discriminators on `oneOf` results; `format: uuid` and `format: date-time` where applicable; `required` on response DTOs; non-JSON responses declared with their real content type.
6. Webhook event payloads as named schemas, an `x-webhooks` map and a `WebhookEventType` enum, generated from `defineCatalogue`.
7. `.addServer()` and tag descriptions on every API; the Social mis-attached decorators (`post.controller.ts:415-421`) fixed; Platform's `oneOf [envelope, array]` API-key list reduced to the envelope.
8. Mail: the Resend-shaped raw send (`POST /emails`, monorepo mail-api/002) ships before the Mail SDK, so `mail.emails.send` is in 1.0. Nouns: `emails` is the call-level resource (send, batch, list, retrieve, metrics); `messages` is the per-recipient delivery log (list, retrieve, timeline, body, erase).
9. `x-pc-sdk.poll` on Trawl job retrieve and Mail domain retrieve; `public: true` on Waitlist public routes.

## 10. CI

- `ci.yml`: install, refresh-free codegen, determinism check (codegen twice, diff), lint, build, unit tests, a generated test that calls every operation with its spec `example` against a mock fetch and asserts method, path, query, bound params and Idempotency-Key presence, the runtime contract suite against a local mock server, ESM and CJS smoke of `dist` on Node 20, 22 and 24 (one process loading both builds), snippet typecheck, the hand-written allowlist check, the size budget, type resolution of the packed tarballs (`scripts/check-types-resolution.mjs`: attw on node10, node16 CJS and ESM and bundler for every subpath, plus a real consumer typechecked as a node16 `.cts`, a nodenext `.mts` and a node10 CommonJS file), and a committed public API report per package (`api-extractor`, `packages/<p>/api-report.md`) diffed on every PR.
- `spec-refresh.yml`: pushes with the SDK bot GitHub App's installation token (repo variable `SDK_BOT_APP_ID`, secret `SDK_BOT_PRIVATE_KEY`) so CI runs on its PRs. Until that App exists (creating it needs a GitHub web sign-in as the owner), it pushes with `GITHUB_TOKEN` and dispatches `ci.yml` on `chore/refresh-specs` (`workflow_dispatch` is allowed from `GITHUB_TOKEN`; the dispatched run reports a `CI / build-and-test (dispatched)` commit status on the PR head, because PR check rollups ignore dispatch check suites). `scripts/refresh-specs.sh` fails the run, and leaves the vendored file untouched, when any `/docs-json` is unreachable or is not an OpenAPI 3 document with paths. One changeset per changed surface; labelled `breaking` when `oasdiff breaking` or the API report diff finds a break.
- `release.yml`: unchanged trust model (OIDC trusted publishing, `npm@11`). The changesets action uses the same App token so Version Packages PRs get CI too, with the same `ci.yml` dispatch on `changeset-release/main` as the fallback. A `workflow_dispatch` snapshot input publishes Auth previews under `next`.
- Live smokes (`scripts/live/<p>.mjs`) prefix every resource `sdk-smoke-<ts>`, start by deleting stale prefixed resources (a killed session never runs `finally`), stay at 5 req/s or less, send mail only to the SES simulator, and never change workspace settings, services, keys or policies.

## 11. Build order

| # | Repo | Task |
|---|---|---|
| 1 | monorepo | `tasks/console/085-social-quickstart-community-id.md` (fix now, independent) |
| 2 | sdk-node | `tasks/001-spec-refresh-runs-ci.md` (start now) |
| 3 | monorepo | `tasks/monorepo/020-request-id-and-shared-error-envelope.md` |
| 4 | monorepo | `tasks/monorepo/021-openapi-sdk-conventions-lib.md` (`x-pc-sdk`, names snapshot, idempotency in-progress, audit rules) |
| 5 | sdk-node | `tasks/002-core-runtime.md` (needs only 001; may run alongside 3 and 4) |
| 6 | sdk-node | `tasks/003-generator-pipeline.md` (fixture spec; does not wait for any deployed spec) |
| 7 | monorepo | `tasks/monorepo/022-typed-webhook-event-schemas.md` |
| 8 | monorepo | `tasks/trawl-api/005-sdk-grade-openapi.md` |
| 9 | sdk-node | `tasks/004-trawl-generated.md` (trawl 1.0.0 stable) |
| 10 | monorepo | `tasks/productcraft-co/227-docs-on-generated-sdks.md` (Node tab from the manifest, Trawl docs, errors catalogue, testing page) |
| 11 | monorepo | `tasks/mail-api/002-raw-send-api.md` |
| 12 | monorepo | `tasks/mail-api/063-sdk-grade-openapi.md` |
| 13 | sdk-node | `tasks/005-mail-generated.md` (mail 1.0.0) |
| 14 | monorepo | `tasks/waitlist-api/008-sdk-grade-openapi.md` |
| 15 | sdk-node | `tasks/006-waitlist-generated.md` (waitlist 1.0.0) |
| 16 | monorepo | `tasks/platform-auth-api/021-sdk-grade-openapi.md` |
| 17 | sdk-node | `tasks/007-platform-auth-generated.md` (platform-auth 1.0.0) |
| 18 | monorepo | `tasks/social-api/045-sdk-grade-openapi.md` |
| 19 | sdk-node | `tasks/008-social-generated.md` (social 1.1.0) |
| 20 | monorepo | `tasks/users-api/096-sdk-grade-openapi.md` |
| 21 | sdk-node | `tasks/009-auth-on-the-pipeline.md` (auth 1.0 previews under `next`) |
| 22 | sdk-node | `tasks/010-umbrella.md` |
| 23 | monorepo | `tasks/console/086-sdk-quickstarts-on-generated-sdks.md` |
| 24 | monorepo | `tasks/productcraft-co/228-docs-remaining-products.md` (Mail, Waitlist, Platform, Social, Auth pages; Workbench; changelog) |
| 25 | sdk-node | `tasks/012-stable-release.md` (auth, auth-passport, core, umbrella 1.0.0; root README) |

The former task 011 (generated docs) is folded into 003 (the generator emits every doc artefact), 004 (`files`/`npm pack` checks on the first generated package) and 012 (root README). Docs on productcraft.co follow each product instead of waiting for the end: 227 lands right after Trawl, and 228 is split into one checklist item per product that can be done as soon as that product's SDK release is on npm (its row in the table marks the last one, Auth).

**Consumers (corrected facts, 2026-11-06):** conquer-services pins `@productcraft/auth ^0.6.0`, `auth-passport ^0.2.2`, `platform-auth ^0.0.12`, `social ^0.7.0` (pnpm catalog); WriteWave `apps/api` pins auth `^0.6.0`, auth-passport `^0.2.2`, mail `^0.1.1`, social `^0.7.0`; dispute.markets has no `@productcraft` dependency; productcraft-co pins `@productcraft/trawl 0.2.0` and `productcraft 0.3.1` exactly. conquer and WriteWave are already several breaking lines behind and **stay on their current versions** until someone upgrades them; this program files no tasks in those repos. The Auth compat file covers the 0.6.x names they call, so an upgrade is a version bump plus the migration guide's casing table.

`monorepo/tasks/mail-api/020-sdk-and-cli-parity.md` is superseded for its Node part by this program. Its Python, Go and CLI parts stay open and should reuse `x-pc-sdk` and `manifest.json`.

## 12. Deferred (not in this program)

- Auth framework helpers (`@productcraft/auth/next` middleware, Express and Hono middleware next to auth-passport) and a separate `/browser` entry: post-1.0 minors once the generated surface is stable.
- Zod input for Trawl typed results (`jobs.create({ schema: zodSchema })`): the generic `createAndPoll<T>` ships now; zod support would add a peer dependency.

## 13. Decision log

2026-11-07, task 010 (umbrella `productcraft` 0.4) as built:

- **No stable 0.4.0; it ships as a `next` snapshot and goes stable as 1.0.0 in 012.** The umbrella is built against the workspace `@productcraft/auth`, which is the 1.0 code. A stable 0.4.0 "pinned to auth 0.x" would ship 1.0-typed code over a 0.9 runtime, and the auth major's Version Packages PR is held red until 012 anyway. The `minor` changeset waits with the others; 012's `major` takes the umbrella straight to 1.0.0.
- **Lazy products in 60 lines.** `ProductCraft` keeps the shared options and builds each product in a getter on first access (the same instance after that). A browser-guard `ConfigurationError` therefore surfaces on first access, not in the constructor. The umbrella's `index.ts` lost its line-limit exception.
- **One workspace id.** The umbrella reads `PRODUCTCRAFT_WORKSPACE_ID` once at construction and passes it to every product. Without one, core's per-process key lookup cache is now kept on `Symbol.for("productcraft.workspaceCache")`, so products on different core copies still make one lookup (core patch).
- **The credential is not pre-resolved from the environment** by the umbrella: Auth's consumer scope must keep never reading `PRODUCTCRAFT_API_KEY`, which an explicit key would defeat.
- **`pc.platform`** matches the generated docs (`platform.apiKeys.self()`); `pc.platformAuth` is the same instance, kept without a deprecation. `overrides.platform` wins over `overrides.platformAuth`.
- **Re-exports:** the six product classes (with their type namespaces), every error class, each `<Product>ErrorCode`, `verifyWebhook`, `PC_BASE_URL` and the runtime types (`ClientOptions`, `RequestOptions`, `APIPromise`, `Page`, `PagePromise`, `Logger`, `LogLevel`, `PCAuth`, `PCClientConfig`). Not `export *`: the products' `paths`/`components` would collide.

2026-11-07, task 009 (Auth 1.0 on the pipeline, `next` snapshots) as built:

- **One generator path.** kubb, `kubb.config.ts`, `src/scopes/` and `_http.ts` are gone; `scripts/codegen.sh` runs `gen-sdk.mjs` for every surface (its `openapi-typescript` loop is now empty). 214 operations generated (226 in the spec, 12 `x-pc-sdk: false`).
- **Scope config grew three generic keys:** `accessor: "admin.app"` (a nested accessor, with `aliases: ["app"]` for `auth.app(id)`, which stays a plain alias, not deprecated), `expose` (a getter for a bound parameter, `app(id).appId`) and `members` (names hand-written code owns on a scope, checked like reserved words). An empty `resource` puts the method on the scope root (`consumer(slug).signin()`); the generator rejects it outside a bound scope.
- **Hand-written extras attach by inheritance, not a config callback.** SURFACES `root: { module, base, options }` makes the generated `Auth` extend a hand-written `AuthBase` (`src/base.ts`, itself extending the generated `AuthResources`), which owns `consumer(slug)` (`accessor: false` on that scope) and the top-level `verifyToken`. `consumer(slug)` returns `ConsumerScope` (`src/consumer.ts`), a subclass of the generated `AuthConsumer` adding `verifyToken`, `jwks`, issuer/audience and the passkey ceremonies, which call generated methods.
- **The consumer client never reads `PRODUCTCRAFT_API_KEY`**, as in 0.8: core gained `credentialFromEnv: false` (core minor) instead of Auth building its own transport.
- **Compat aliases are generated into `resources.ts`, not a separate `compat.ts`:** TypeScript only adds members to a class in its own declaration. `compat.json` maps every 0.6.0 and 0.8.0 name (recorded from the published packages, `tests/compat/`) to an operationId or to hand-written code; the generator emits a `@deprecated` alias wherever the 1.0 name differs, in its 0.x namespace (`consumer(slug).auth.signin`, `app(id).invites.revoke`), crossing scopes where needed (`app(id).get()` calls `apps.retrieve` with the bound id). `_generated/compat.ts` holds the deprecated 0.x type names. `oauth.clientCredentials` is such an alias of `oauth.token`, not a separate hand-written helper. `compat.test.ts` calls every recorded name and compares method and path.
- **`AuthHttpError` is `APIError`** (same object, so branded `instanceof` works across builds); its 0.x `data`/`statusText` fields are gone (`body`, `status`), listed in the migration guide.
- **CJS on Node 20.3:** the CJS builds of auth and auth-passport bundle `jose` (tsup `noExternal`, CJS only); the ESM builds keep it external. `smoke-dist.mjs` asserts no `require("jose")` and verifies a real token through both builds; CI's dist-smoke matrix adds Node `20.3.0`.
- **auth-passport** takes auth as a peer (`^1.0.0-0 || ^1`) so it shares the app's copy.
- **Snapshots:** `release.yml` takes `workflow_dispatch` input `snapshot` (default `next`, `latest` refused) and runs `changeset version --snapshot` + `changeset publish --tag` in the runner only; `.changeset/config.json` sets `snapshot.useCalculatedVersion`, so previews are `1.0.0-next-<datetime>`. While the auth major is pending, every Version Packages PR bumps auth to 1.0.0; a ci.yml step holds such a PR red until `tasks/012-stable-release.md` is deleted, so `latest` cannot move early. Task 010 resolved the umbrella's release around that (decision log, 2026-11-07, task 010).
- **Size:** the one-call consumer bundle (`auth.consumer(slug).signin()`) is 24.9 KB gzip, the largest product: the consumer scope class pulls its resource tree and `jose` (offline verification). Recorded as the baseline.
- **Live smoke credential:** `scripts/live/auth.mjs` uses the standing testing-environment workspace key and keeps everything inside one throwaway `sdk-smoke-<ts>` app it creates and deletes (stale ones swept first).

2026-11-06, task 008 (Social 1.1) as built:

- **Names are unique per scope, as openapi-audit checks them.** Social has the same webhook routes on the workspace root and inside a community, so `social.webhooks.endpoints.list()` and `social.community(id).webhooks.endpoints.list()` are different methods. The generator's collision check now keys on scope + `resource.method`. Where a `resource.method` exists in more than one scope, the scoped copy's type names carry `<Scope>Scoped` (`Social.CommunityScopedWebhookEndpointCreateParams`); the root keeps the plain name. "Scoped" keeps them apart from a root `communities.*` stem.
- **`delete` may name a POST action** that removes one object without an HTTP `DELETE` (`POST …/posts/{post_id}/tags/{tagged_actor_id}/remove` is `posts.tags.delete`): the path verb would be the banned `remove`, and openapi-audit accepts it. It still needs an id. Retries follow the HTTP method, so it is not retried without an idempotency key.
- **`.as(actorId)` makes a required `actor_id` optional in queries too**, not only in bodies (`lists.feed.list(listId)`, `conversations.messages.list(id)`): the generated examples for those failed the snippet check.
- **Additive, so a minor.** 1.0's public surface is all still there (`Social`, `.client`, `paths`); the API report also shows `paths` moving from an interface to a type alias (the generator's `--export-type`) and `client` becoming a getter, neither of which breaks a caller. Inside a community scope, `actor_id` is optional in the types whether or not `.as()` was called (one class serves both); the API answers 400 when a required one is missing.
- **Live smoke credential:** `scripts/live/social.mjs` uses the standing testing-environment workspace key (`[productcraft.social_verify]`) and keeps everything inside one throwaway `sdk-smoke-<ts>` community, which it deletes (and sweeps stale ones first).

2026-11-06, task 007 (Platform 1.0) as built:

- **Form uploads are typed fields, not a raw body.** Platform is the first spec with a `multipart/form-data` body (workspace and user avatars). The generator now types each form field (`format: binary` as `Blob`, so a `File` keeps its name) and sends a `FormData` it builds itself: `platform.workspaces.avatar.upload("acme", { file })`. Other non-JSON bodies take `{ body }` typed as `RequestInit["body"]` (the DOM-only `BodyInit` broke the `.d.ts` build without the DOM lib).
- **conquer-api's `.client.POST('/v1/introspect/api-key', { params: { header: { authorization: "" } } })` no longer compiles**, since platform-auth-api/021 (published in 0.2.0) stopped declaring `authorization` as a header parameter. The call without that line compiles and runs on 1.0; the migration guide says to delete it. Re-declaring a fake header in the API to keep a workaround compiling was rejected.
- **The live smoke mints and revokes one `sdk-smoke-` key** bound to the workspace's existing readonly-preset policy (passing `preset` could create that policy, which the smoke must not do), and signs in through the SDK's own public `auth.signin`.
- **`check-dts` brands with an object-or-symbol union**: a free-form body (`additionalProperties: true`, the service settings) is a real type that accepts any object, so the object-only brand reported it as `any`.

2026-11-06, task 006 (Waitlist 1.0) as built:

- **Field names follow the spec, not the task sketch.** The task's call sites used `lists.create({ name })` and a public submit with only `email`; the API's wire fields are `display_name` (create) and a required `name` (public submit), so the acceptance and section 2.2 use those. No API change: renaming a stable wire field is not worth a 1.0.
- **The public submit carries an `Idempotency-Key`**, because the spec declares the header on it (a retried signup must not sign the person up twice). The API's CORS preflight allows `content-type,idempotency-key` from any origin, checked live, so browser forms work; the public reads send none.
- **Simulator signups are test entries.** waitlist-api stores `…@simulator.amazonses.com` signups with `is_test: true` and a negative position, left out of counts and exports unless `include_test: true`. The live smoke asserts both sides.
- **Example variables never shadow the client variable:** the `Waitlist` model would read `const waitlist = await waitlist.lists.create(…)`; the generator falls back to the resource's singular (`list`), then a `Result` suffix (`resultVar` in `emit-code.mjs`, unit-tested).

2026-11-06, task 005 (Mail 1.0) as built:

- **`messages.body(id)` resolves to JSON**, not a `Response`: the API answers `GET /messages/{id}/body` with `application/json` (the cleartext body inside an object), so section 4's "message bodies return `Response`" applies to raw MIME and attachments (`received.raw`, `mailboxes.messages.raw`, `*.attachments.retrieve`) and the CSV exports. The generator follows the content type; nothing was renamed.
- **Example variables never use JS keywords:** `contacts.imports.list` singularised to `import`; the generator now suffixes keyword names (`importItem`, `defaultResult`).
- **The live smoke sends from a standing sending domain.** Mail refuses a From on any domain that is not an active sending domain of the workspace (422 `from_domain_not_verified`), and verifying a throwaway domain needs DNS writes per run. testing-environment therefore keeps one standing sending domain, `sdk-live.productcraft.co` (DKIM, return-path and DMARC records in the DigitalOcean `productcraft.co` zone, added 2026-11-06); `scripts/live/mail.mjs` only reads it and sends to `success@simulator.amazonses.com`. Its own throwaway resource is a `sdk-smoke-<ts>` template.

2026-11-06, task 004 (Trawl 1.0, the first generated product) as built:

- **Typed polled results come from the spec.** `x-pc-sdk.poll.result` (monorepo `@SdkPoll({ …, result })`, checked by openapi-audit: it must name a free-form object property of the 200 response) makes `poll<TResult>` / `createAndPoll<TResult>` generic; the generator emits `WithResult<Model, "result", TResult>` (a reserved helper name), which keeps the property's optional/nullable modifiers. No per-product rename table in the SDK.
- **The wire field is `suggested_urls`**, not `urls`: the call-site examples in the task and in 2.2 used a name the API never had; the SDK does not rename fields (3.4), so the examples were corrected instead.
- **`manifest.json`** is copied to the package root at build time (gitignored there) and exported as `@productcraft/trawl/manifest.json`; `scripts/check-pack.mjs` asserts in CI that every generated public package packs `manifest.json`, `api.md`, the README and the `/testing` build.
- **Live smoke credential:** `scripts/live/trawl.mjs` signs in as the platform user and uses the session as a bearer token (logged out in `finally`), so it never mints or revokes a workspace key. Jobs have no delete and no name, so the smoke tags them with a trailing `[sdk-smoke-<ts>]` in `description` (a leading tag made the extraction agent report the task incomplete) and cancels its own; one small extraction runs to completion (a few credits in testing-environment).

- **1.0.1: the type namespace was `any` in the published `.d.ts`.** The dts bundler flattens `T.Job` to `Job`, so `export type Job = T.Job` inside `namespace Trawl` became `type Job = Job` (TS2456, and an any-like type under `skipLibCheck`). Namespace members now alias module-level `__<Name>` types. `scripts/check-dts.mjs` (CI) typechecks every generated package's built `.d.ts` with `skipLibCheck` off and asserts each public type rejects an unrelated value. Lesson: the source-level type tests and the snippet check (skipLibCheck on) could not see it; check the published artefact.

2026-11-06, task 003 (generator pipeline) as built:

- **Fixture package.** The generator is proven on `packages/gen-fixture` (private, never published; spec `packages/gen-fixture/fixture.openapi.json`, 23 operations covering every 3.2 shape, both scope kinds, `.as()`, polling, public, non-JSON, webhooks and error codes). Goldens of every generated file, 21 failure-case tests, a `tsc`-checked type-rules file and the generated per-op test run in its test script. A dry run on the live Trawl spec (17 operations) typechecked and passed its generated per-op test.
- **The product class is generated** (`_generated/client.ts`) with its type namespace merged into it (`export namespace Mail { export type Domain = … }`, values for enum `.values`). TypeScript only merges a class and a namespace declared in one file, so the class cannot live in the hand-written `index.ts`; identity moves to the `SURFACES` config. Auth's extras (009) attach through a config option or re-exports, not a hand-written class.
- **Open response enums are type-level:** `Open<T>` widens string-literal unions of two or more members in response types to `… | (string & {})`. Single-literal discriminators stay exact, request types stay closed, and `.client` keeps the raw spec types.
- **Defaults:** `defaultNonNullable: false`, plus a pre-pass that adds defaulted properties to `required` in schemas reachable only from responses. A schema used by both a request and a response keeps the request reading (optional), the safe direction.
- **`UnknownWebhookEvent.type` is a `unique symbol` at the type level.** A string-typed member is never filtered by `switch (event.type)`, so known cases would not narrow; a unit type no literal matches gives both narrowed cases and `default: UnknownWebhookEvent`. At runtime it is the type string.
- **Generator-owned names are reserved** in every product namespace (`Open`, `WithLastResponse`, `WithOptionalActor`, `RequestOptions`, `PollOptions`, `ErrorCode`, `UnwrapWebhookEvent`, `UnknownWebhookEvent`, `WebhookUnwrapParams`, and `WebhookEventType` unless the API defines that enum, which then wins). Resource classes are suffixed `Resource` so they never shadow a model in the bundled `.d.ts`.
- **Toolchain pins** are exact in the root `package.json` only; published packages keep a caret range on `openapi-fetch` (a runtime dependency) so consumers do not get duplicate copies.
- **Snippet check:** 52 blocks in the old product READMEs and the root README failed (fragments with `…`, stale paths), more than the 8 estimated; all are fenced ` ```ts before ` until their product task rewrites the README (root README: 012).
- **Breaking detection in spec-refresh:** oasdiff 1.34.1 (checksum-pinned) per changed spec, plus any API report losing lines; either sets the `breaking` label and lists the findings in the PR body.

2026-11-06, task 002 (core 0.4.0) as built: `RateLimitError.retryAfter` is in seconds (the header's unit); poll timeouts throw `APITimeoutError` (no separate poll error class); `verifyWebhook` resolves to the parsed payload so `unwrap` is a thin typed wrapper; the escape hatch is the standalone `createOpenAPIClient(apiClient)` instead of a client method, which kept openapi-fetch out of the one-call bundle (6.8 KB gzip instead of 9.0 KB); the `APIClient` credential is non-enumerable so logging a client never prints the key. Known gap found while testing on Node 20.3.0: `@productcraft/auth`'s CJS build requires the ESM-only `jose` 6, which works only from Node 20.19 (`require(esm)`); core and the other products load on 20.3. Fixed in 009 (requirement added there); CI's Node 20 leg runs the latest 20.x, which does not show it. The size budget lives in `scripts/size-budget.json` (`node scripts/size-budget.mjs`, `--record` to re-baseline).

2026-11-06, two design reviews of e39c9ec. Accepted unless listed below; the accepted points are folded into the sections above.

Accepted (summary): Node 20.3 engines + CI matrix; literal unions and open response enums, unknown webhook event; request/response default split; public type names from `x-pc-sdk-model`; naming rules for GET sub-paths, exports, `PATCH …/<field>` and id-less DELETE; reserved hand-written names; non-JSON responses return `Response`; no retry of POST/PATCH without a key; Mail raw send in the build order and the `emails`/`messages` split; `ConfigurationError` and per-process cache for workspace resolution; UUID examples; `errors[]` and `docUrl`; flattened Auth consumer scope, `auth.admin.app`, top-level `verifyToken`; `social.community(id).as(actorId)`; poll helpers and typed Trawl results; one object-shaped webhook verifier with config/env and array secrets and raw-body recipes; `waitlist.public({ workspace, waitlist })`, keyless constructor, `dangerouslyAllowBrowser`; `waitlist.lists`; docs per product instead of at the end, plus a testing page; `lastResponse` and `rateLimit`; `logger` option; generated `/testing` mocks; `maxItems` and `.pages()`; options-only call shape; documented worst-case timeout; additive-only /v1; no program-wide pre mode (stable per product, social 1.1.0, Auth snapshots); `IDEMPOTENCY_IN_PROGRESS` instead of re-execution, Redis fail-open documented; per-API idempotency scope extractors and contract test; no wire change to `message`; `Symbol.for` error branding; exact toolchain pins, API reports, `oasdiff`; API-side names snapshot; hand-written allowlist and generated compat; measured size budget and realistic generator size; ` ```ts before ` fences; corrected consumer facts and 0.6.x compat coverage; per-op generated test; `sdk-smoke-` sweep and no settings mutations; App token for Version Packages PRs; 002/003 decoupled from the spec tasks.

Rejected or changed:

- **Key-scoped routes without `{workspace_id}`, or a workspace id embedded in the key format:** rejected for this program. Both change every product's routing or the key format (security-sensitive, invalidates issued keys); the resolved-once lookup with a clear `ConfigurationError` and the "pass workspaceId" advice covers the cost.
- **Dropping the per-request `workspaceId` option:** rejected. Bearer tokens (platform users) span workspaces and need it.
- **Prefixed IDs (`ws_`, `com_`):** rejected. About 400 `format: uuid` fields across six databases; the examples now show UUIDs instead of promising prefixes.
- **One noun for all outbound mail:** changed. `emails` (calls) and `messages` (per-recipient deliveries) are different granularities in mail-api/002's storage model; metrics move under `emails`.
- **`mail.domains.waitForVerification`:** changed to the generic `domains.poll(id)` so every product polls the same way.
- **`waitlist.public("acme", "beta")` positional:** changed to named `{ workspace, waitlist }` so the slugs cannot be swapped.
- **`on('request' | 'response')` hooks:** rejected. The `fetch` option already intercepts every request (tracing libraries wrap it); `logger` covers logging.
- **MSW handlers:** changed to a dependency-free generated `createMockFetch()`.
- **`{ id, deleted: true }` from deletes:** rejected. Our APIs return 204 by convention; the SDK would have to invent a body.
- **An overall `deadline` option:** rejected. `signal: AbortSignal.timeout(ms)` already gives one; the worst case is documented.
- **`apiVersion` pin:** rejected. There is one version per API; the additive-only /v1 rule and open enums are the compatibility mechanism.
- **Generator soft mode for missing `x-pc-sdk`:** rejected. The generator only runs on switched packages, so unblocking 002 and 003 needs no soft mode.
- **Upgrade tasks in conquer-services and WriteWave:** not filed. They stay on their pins (stated in section 11); compat covers their names when they upgrade.
- **Framework helpers and zod input:** deferred (section 12).
- **App token for bot PRs (task 001, 2026-11-06):** changed to App-token-when-configured plus a `ci.yml` dispatch fallback. No App or PAT could be created without a GitHub web sign-in; the fallback gives the bot PRs real CI checks today, and the workflows switch to the App token as soon as `SDK_BOT_APP_ID` is set.
- **Packaging fixes (2026-11-07):** CommonJS consumers on node16/nodenext got the ESM `.d.ts` through a flat `types` condition (TS1479, "masquerading as ESM") and `/testing` did not resolve on node10 (conquer-api). Exports now nest `types` per condition, `/testing` has a `typesVersions` fallback, Auth's CJS build emits its own `.d.cts` with jose's types copied structurally, and CI runs `scripts/check-types-resolution.mjs`. Correction to the task-002 entry: the 6.8 vs 9.0 KB saving from a standalone `createOpenAPIClient` holds for core alone; product bundles keep openapi-fetch because of the `.client` getter (section 4).

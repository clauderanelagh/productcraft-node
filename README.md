# ProductCraft Node SDK

Node.js and TypeScript SDKs for the [ProductCraft](https://productcraft.co) APIs: Auth, Mail, Waitlist, Social, Trawl and Platform. Resources and verbs you can guess (`mail.emails.send()`, `waitlist.lists.list()`, `trawl.jobs.createAndPoll()`), every parameter and response typed, and the plumbing built in: retries, timeouts, auto-pagination, idempotency keys, typed errors and webhook verification.

Every package is generated from its API's live OpenAPI document, so the SDK and the API cannot drift apart. The contract every package is built to is [docs/sdk-standard.md](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/sdk-standard.md).

## Install

Install one product, or the umbrella for all of them:

```sh
npm install @productcraft/mail      # or auth, waitlist, social, trawl, platform-auth
npm install productcraft            # every product from one import
```

Node 20.3 or later (ESM and CommonJS), Bun, Deno and edge runtimes.

## Quick start

```ts
import { ProductCraft } from "productcraft";

// The key falls back to PRODUCTCRAFT_API_KEY, the workspace to PRODUCTCRAFT_WORKSPACE_ID.
const pc = new ProductCraft({
  apiKey: process.env.PRODUCTCRAFT_API_KEY,
  workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b",
});

// Mail: an Idempotency-Key is generated for you, so a retry never sends twice.
await pc.mail.emails.send({
  from: "Acme <hello@mail.acme.com>",
  to: "success@simulator.amazonses.com",
  subject: "Welcome",
  html: "<p>Thanks for signing up.</p>",
});

// List calls auto-paginate with for await.
for await (const list of pc.waitlist.lists.list()) console.log(list.id, list.slug);

// Auth: sign an end user in to one of your apps, then verify their token offline.
const session = await pc.auth.consumer("my-app").signin({ identifier: "ada@example.com", password: "…" });
if (session.result === "session") {
  const claims = await pc.auth.verifyToken(session.access_token, { app: "my-app" });
  console.log(claims.sub);
}
```

A single product works the same way on its own:

```ts
import { Mail, RateLimitError } from "@productcraft/mail";

const mail = new Mail(); // reads PRODUCTCRAFT_API_KEY

try {
  const email = await mail.emails.send(
    { from: "hello@mail.acme.com", to: "success@simulator.amazonses.com", subject: "Hi", text: "Hello" },
    { idempotencyKey: "welcome-user-42", timeout: 10_000 },
  );
  console.log(email.id, email.lastResponse.requestId);
} catch (err) {
  if (err instanceof RateLimitError) console.log("retry in", err.retryAfter, "s");
  else throw err;
}
```

## The packages

| Package | Product | Reference | 0.x to 1.x |
|---|---|---|---|
| [`productcraft`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/umbrella#readme) | Every product below from one key and one shared config | each product's `api.md` | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/productcraft-1.0.0.md) |
| [`@productcraft/auth`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/auth#readme) | End-user sign-in, sessions, MFA, passkeys and tenants; the admin API for your apps; offline token verification | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/auth/api.md) | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md) |
| [`@productcraft/mail`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/mail#readme) | Transactional email, templates, domains, the delivery log, contacts, broadcasts | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/mail/api.md) | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/mail-1.0.0.md) |
| [`@productcraft/waitlist`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/waitlist#readme) | Waitlists, public signup forms, variants, referrals and leaderboards | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/waitlist/api.md) | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-1.0.0.md) |
| [`@productcraft/social`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/social#readme) | Communities, posts, feeds, stories, conversations, moderation | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/social/api.md) | [1.1 guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/social-1.1.0.md) |
| [`@productcraft/trawl`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/trawl#readme) | AI web extraction jobs | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/trawl/api.md) | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/trawl-1.0.0.md) |
| [`@productcraft/platform-auth`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/platform-auth#readme) | Your ProductCraft workspaces: members, roles, IAM policies, API keys, services | [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/platform-auth/api.md) | [guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/platform-auth-1.0.0.md) |
| [`@productcraft/flags-engine`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/flags-engine#readme) | Flags evaluation engine: local, synchronous evaluation of a Flags config; the spec and test vectors | [SPEC.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/flags-engine/SPEC.md) | new (0.x preview) |
| [`@productcraft/auth-passport`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/auth-passport#readme) | Passport JWT strategy that verifies Auth access tokens | README | API unchanged; peer `@productcraft/auth` ^1 |
| [`@productcraft/core`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/core#readme) | The shared runtime every product uses (you rarely import it directly) | README | additive |

## What every product gives you

- **Typed resources.** Namespaces and verbs come from the OpenAPI tags and operation ids, with JSDoc from the spec descriptions. Bodies and responses use the API's snake_case wire names.
- **Pagination.** `for await (const item of x.list())` walks every page; `.pages()` to walk pages yourself, `maxItems` to stop early. A single page keeps `next_cursor` and `has_more`.
- **Retries and timeouts.** Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` retry with exponential backoff and jitter, honouring `Retry-After` (`maxRetries`, default 2). `timeout` is per attempt (default 60 s); every call takes an `AbortSignal`.
- **Idempotency.** Writes that the API declares idempotent get an `Idempotency-Key` automatically, reused across retries; pass `idempotencyKey` to set your own.
- **Errors by class.** `BadRequestError`, `AuthenticationError`, `PaymentRequiredError`, `PermissionDeniedError`, `NotFoundError`, `ConflictError`, `UnprocessableEntityError`, `RateLimitError`, `InternalServerError`, `APIConnectionError` and `APITimeoutError`, all carrying `status`, `code`, `requestId` and `docUrl`. `instanceof` works across products.
- **Per-request options.** `idempotencyKey`, `timeout`, `maxRetries`, `headers` and `signal` on every call.
- **Raw responses.** Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`); `.withResponse()` on any call adds the `Response` and the parsed rate-limit headers.
- **Webhooks.** `x.webhooks.unwrap({ payload, headers })` verifies the Standard Webhooks signature and returns a typed event (Mail, Waitlist, Social, Trawl and Auth).
- **Testing.** `@productcraft/<product>/testing` exports `createMockFetch()`, which answers every operation with its spec example.
- **Escape hatch.** `x.client` is the typed [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) client over the same credential and base URL, for anything you want to call by path.

## Credentials

Pass `apiKey` (a workspace key, `pcft_live_…`), or omit it and the client reads `PRODUCTCRAFT_API_KEY`. `auth: { type: "bearer", token }` takes a platform user token. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or another variable a bundler inlines into browser code (a workspace key in a browser throws unless you set `dangerouslyAllowBrowser: true`). Auth's consumer routes (`auth.consumer(slug)`) never read `PRODUCTCRAFT_API_KEY`, and Waitlist's public signup routes need no key at all.

## How the SDKs are built

1. `scripts/refresh-specs.sh` pulls each API's production `/docs-json` into `Specs/<product>.json` (nightly, through `spec-refresh.yml`).
2. `scripts/gen-sdk.mjs` generates every product's resources, types, error codes, mocks, `api.md`, README reference sections, examples and `manifest.json` from that spec, over the shared runtime in `@productcraft/core`.
3. CI checks that generation is deterministic, typechecks every code block in the docs, diffs each package's public API report, and smoke-tests the built ESM and CommonJS output on Node 20, 22 and 24.

A wrong name or type is fixed in the API's OpenAPI annotations, never in generated code.

## Versioning

Every package follows SemVer on its own version line. Since 1.0, a spec refresh that only adds operations or optional fields is a minor release; anything that breaks a call or a type is a major with a migration guide under [docs/migrations](https://github.com/clauderanelagh/productcraft-node/tree/main/docs/migrations). Releases go out through Changesets and npm trusted publishing, with provenance.

## Local development

```sh
git clone https://github.com/clauderanelagh/productcraft-node
cd productcraft-node
pnpm install
pnpm run codegen      # regenerate every product from Specs/
pnpm run lint && pnpm run build && pnpm run test
```

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

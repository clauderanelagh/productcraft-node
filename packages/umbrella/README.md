# productcraft

All-in-one Node.js / TypeScript SDK for the [ProductCraft](https://productcraft.co) platform: Auth, Mail, Waitlist, Social, Trawl, Flags, Notify and Platform from one import, one key and one shared config.

```bash
npm install productcraft
```

Node 20.3 or later, Bun, Deno and edge runtimes.

Upgrading from 0.3? See the [1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/productcraft-1.0.0.md).

## When to use this

Install **`productcraft`** when one backend calls more than one ProductCraft product (for example it signs users in with Auth *and* sends email with Mail). Install a per-product package when you only need one; the classes are identical:

- [`@productcraft/auth`](https://www.npmjs.com/package/@productcraft/auth): end-user auth, apps, roles, API keys, token verification
- [`@productcraft/mail`](https://www.npmjs.com/package/@productcraft/mail): transactional email, templates, domains, contacts, broadcasts
- [`@productcraft/waitlist`](https://www.npmjs.com/package/@productcraft/waitlist): waitlists, signups, variants, referrals, leaderboards
- [`@productcraft/social`](https://www.npmjs.com/package/@productcraft/social): communities, posts, feeds, stories, conversations, moderation
- [`@productcraft/trawl`](https://www.npmjs.com/package/@productcraft/trawl): AI web extraction jobs
- [`@productcraft/flags`](https://www.npmjs.com/package/@productcraft/flags): feature flags (the management API here; evaluate flags with its `FlagsClient`)
- [`@productcraft/notify`](https://www.npmjs.com/package/@productcraft/notify): notifications across an in-app inbox, email, web push, APNs and FCM (the server API here; browsers and apps use `notify.client({ token })`)
- [`@productcraft/platform-auth`](https://www.npmjs.com/package/@productcraft/platform-auth): workspaces, members, roles, IAM policies, API keys

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

// Waitlist and Trawl: list calls auto-paginate with for await.
for await (const list of pc.waitlist.lists.list()) console.log(list.id, list.slug);
const job = await pc.trawl.jobs.create({
  description: "The product title on each page",
  json_schema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
});
console.log(job.id, job.status);

// Auth: sign an end user in to one of your apps, then verify their token offline.
const session = await pc.auth.consumer("my-app").signin({ identifier: "ada@example.com", password: "…" });
if (session.result === "session") {
  const claims = await pc.auth.verifyToken(session.access_token, { app: "my-app" });
  console.log(claims.sub);
}
```

`pc.auth`, `pc.mail`, `pc.waitlist`, `pc.social`, `pc.trawl`, `pc.flags`, `pc.notify` and `pc.platform` (also reachable as `pc.platformAuth`, its 0.x name) are the same classes the per-product packages export, each built on first access, so an app that only uses `pc.mail` never constructs the others. `pc.flags` is the Flags management client (projects, flags, targeting, SDK keys); to evaluate flags in your app, use `FlagsClient` from `@productcraft/flags` with an SDK key. Each product's README lists its resources and methods.

## Configuration

Everything you pass is shared by every product:

```ts
import { ProductCraft } from "productcraft";

const pc = new ProductCraft({
  apiKey: "pcft_live_…",             // or auth: { type: "bearer", token } / { type: "cookie", value }
  workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b",
  maxRetries: 3,                    // default 2: network errors, 408, 429 and 5xx, honouring Retry-After
  timeout: 20_000,                  // per attempt, default 60 s
  logLevel: "warn",                 // or "debug"; PRODUCTCRAFT_LOG also works
  defaultHeaders: { "x-trace-id": "checkout-42" },
  overrides: {
    // Per product, merged over the shared settings (nested, because `auth` is the credential key).
    mail: { timeout: 5_000 },
    auth: { baseUrl: "https://api.auth.example.test" },
  },
});
```

`workspaceId` is optional with a workspace API key: without it the SDK looks it up once per process from the key and every product shares that one lookup. Pass it, or set `PRODUCTCRAFT_WORKSPACE_ID`, to skip the extra request. Bearer and cookie credentials can span workspaces and must pass it.

Credentials from the environment are a server-only fallback. Never put a key in `NEXT_PUBLIC_*` or another variable a bundler inlines into browser code; a workspace key in a browser throws unless you set `dangerouslyAllowBrowser: true`. Auth's consumer routes (`pc.auth.consumer(slug)`) never pick up `PRODUCTCRAFT_API_KEY`.

## Errors and types

Every error class is exported, and `instanceof` works across products:

```ts
import { ProductCraft, NotFoundError, RateLimitError, APIError, type Mail } from "productcraft";

const pc = new ProductCraft();
try {
  await pc.mail.domains.retrieve("0b8a3f9e-5d1c-4e2a-9f6b-7c3d2e1a0f4b");
} catch (err) {
  if (err instanceof NotFoundError) console.log("no such domain", err.requestId);
  else if (err instanceof RateLimitError) console.log("retry in", err.retryAfter, "s");
  else if (err instanceof APIError) console.log(err.status, err.code, err.docUrl);
  else throw err;
}

// Each product's type namespace: Mail.Domain, Trawl.Job, Waitlist.Entry, …
const status: Mail.DomainStatus = "active";
```

`verifyWebhook` (Standard Webhooks signatures) is exported too; each product also has `webhooks.unwrap()` with typed events.

## Escape hatch

`pc.<product>.client` is the typed [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) client over the same credential and base URL (it does not retry), for anything you want to call by path.

## How it is built

Every product is generated from its API's live OpenAPI document by [`scripts/gen-sdk.mjs`](https://github.com/clauderanelagh/productcraft-node/blob/main/scripts/gen-sdk.mjs) over one shared runtime, `@productcraft/core`. The contract is [docs/sdk-standard.md](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/sdk-standard.md).

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

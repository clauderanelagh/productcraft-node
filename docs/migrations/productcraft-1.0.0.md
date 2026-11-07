# Migrating to productcraft 1.0

`productcraft` 1.0 is the umbrella over the generated 1.x products: `pc.auth` (`@productcraft/auth` 1.x), `pc.mail`, `pc.waitlist`, `pc.trawl`, `pc.platform` (1.0) and `pc.social` (1.1). It adds one shared config and resource methods on every product. There was no stable 0.4.0; 0.4 shipped only as a `next` preview, so this guide covers 0.3.x to 1.0.

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { ProductCraft, NotFoundError } from "productcraft"; declare const pc: ProductCraft; -->

## What breaks

Only what breaks in the products themselves. The umbrella's own 0.3 surface (`auth`, `overrides`, `pc.platformAuth`, `.client` on every product) still works.

- **`pc.auth`** is `@productcraft/auth` 1.x. Every 0.6 and 0.8 method name still works as a deprecated alias, but query parameters use their snake_case wire names, list methods return pages and `AuthHttpError`'s `data`/`statusText` are `body`/`status`. See the [Auth 1.0 guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md).
- **Mail, Waitlist, Trawl, Platform and Social** keep `.client` unchanged; their resource methods are new. See the [Mail](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/mail-1.0.0.md), [Waitlist](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-1.0.0.md), [Trawl](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/trawl-1.0.0.md), [Platform](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/platform-auth-1.0.0.md) and [Social](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/social-1.1.0.md) guides.
- **A workspace key in a browser** throws unless you pass `dangerouslyAllowBrowser: true`.

## Constructing the client

```ts before
const pc = new ProductCraft({ auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! } });
```

```ts
const client = new ProductCraft({
  apiKey: process.env.PRODUCTCRAFT_API_KEY,
  workspaceId: process.env.PRODUCTCRAFT_WORKSPACE_ID,
  maxRetries: 3,
  overrides: { mail: { timeout: 5_000 } },
});
```

- `apiKey` is shorthand for `auth: { type: "apiKey", key }`; `auth` still takes bearer and cookie credentials. Both fall back to `PRODUCTCRAFT_API_KEY`.
- Every option (`workspaceId`, `maxRetries`, `timeout`, `fetch`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`, `webhookSecret`) is shared by all products; `overrides.<product>` merges over it.
- Products are built on first access, and without a `workspaceId` they share one key lookup per process.

## Calls

```ts before
const { data, error } = await pc.trawl.client.GET("/v1/workspaces/{workspace_id}/jobs", {
  params: { path: { workspace_id: "<ws>" } },
});
if (error) throw error;
```

```ts
for await (const job of pc.trawl.jobs.list()) console.log(job.id, job.status);

try {
  await pc.mail.domains.retrieve("0b8a3f9e-5d1c-4e2a-9f6b-7c3d2e1a0f4b");
} catch (err) {
  if (err instanceof NotFoundError) console.log("no such domain", err.requestId);
  else throw err;
}
```

`pc.platform` is the Platform client; `pc.platformAuth` is the same instance under its 0.x name. Every error class, `verifyWebhook` and each product's type namespace (`import type { Mail } from "productcraft"`) are exported from `productcraft`.

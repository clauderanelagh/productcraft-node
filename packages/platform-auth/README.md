# @productcraft/platform-auth

Node.js / TypeScript client for the **ProductCraft Platform API**: workspaces, members and invites, roles and IAM policies, workspace API keys, service activation, audit logs, and the introspection endpoints every ProductCraft backend uses to resolve permissions.

Every method, type, error class and mock is generated from the production OpenAPI spec. Upgrading from 0.x? See the [1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/platform-auth-1.0.0.md).

## Install

```sh
npm install @productcraft/platform-auth
```

Node 20.3 or later, Bun, Deno and edge runtimes. Server-side: it sends a workspace key or a platform session. Or install the umbrella package for every product: `npm install productcraft`.

## Which SDK do I want?

| If your goal is to … | Reach for |
|---|---|
| Sign in **your own end-users** in a product you build on ProductCraft | [`@productcraft/auth`](https://www.npmjs.com/package/@productcraft/auth) |
| Manage **your ProductCraft account and workspaces**: keys, members, roles, policies, services | **this package** |

Both have "auth" in the name. Platform owns the ProductCraft account you use to sign in to the console; Auth owns the end-users of the products you build. They are separate databases with separate signing keys.

## Quick start

```ts
import { PlatformAuth } from "@productcraft/platform-auth";

// Reads PRODUCTCRAFT_API_KEY from the environment.
const platform = new PlatformAuth();

// Which workspace and permissions does this key carry?
const me = await platform.apiKeys.self();
console.log(me.workspace_id, me.name, me.allowed);

// Workspace routes take the workspace slug as the first argument.
const ws = await platform.workspaces.retrieve("acme");

// Pages are fetched as you iterate.
for await (const key of platform.workspaces.apiKeys.list(ws.slug, { include_revoked: "false" })) {
  console.log(key.id, key.name, key.status);
}
```

Platform routes name the workspace by **slug**, positionally (`platform.workspaces.members.list("acme")`). The one exception is `platform.stats.retrieve()`, which uses the workspace id: pass `workspaceId`, or let a workspace key resolve it once per process.

## Credentials

| Credential | Pass | Use it for |
|---|---|---|
| Workspace API key (`pcft_live_…`) | `apiKey`, or `PRODUCTCRAFT_API_KEY` in the environment | Backend reads and introspection for the workspace the key belongs to |
| Platform session (a signed-in person) | `auth: { type: "bearer", token }` | Administration: creating workspaces, minting and revoking keys, roles, policies, invites |

```ts
import { PlatformAuth } from "@productcraft/platform-auth";

const anon = new PlatformAuth();
const { access_token } = await anon.auth.signin({ identifier: "ada@example.com", password: process.env.PASSWORD!, session_duration: 3600 });
const admin = new PlatformAuth({ auth: { type: "bearer", token: access_token } });

const minted = await admin.workspaces.apiKeys.create("acme", { name: "Production mail", preset: "mail-send", expires_in_days: 90 });
console.log(minted.token); // shown once: store it in your secret manager
await admin.auth.logoutCurrent();
```

A workspace key cannot mint another key or reshape roles and policies; those calls need a person's session. An explicit `auth` always wins over the environment. The environment fallback is server-only: never put a key in `NEXT_PUBLIC_*` or any variable a bundler inlines into browser code. A keyed client constructed in a browser throws unless you set `dangerouslyAllowBrowser: true`.

## Introspection (for backends that accept workspace keys)

```ts
import { PlatformAuth } from "@productcraft/platform-auth";

// Resolve the key a request carried to its workspace and policy.
declare const incomingKey: string;
const caller = new PlatformAuth({ apiKey: incomingKey });
const { is_valid, workspace_id, policy } = await caller.introspect.apiKey();
```

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `platform.account`: `erase`
- `platform.apiKeys`: `self`
- `platform.auth`: `logout`, `logoutCurrent`, `password.requestReset`, `password.reset`, `refresh`, `signin`, `signup`
- `platform.introspect`: `apiKey`, `retrieve`, `workspaces.retrieve`
- `platform.me`: `avatar.clear`, `avatar.upload`, `hiddenGuides.hide`, `hiddenGuides.list`, `hiddenGuides.reset`, `hiddenGuides.unhide`, `profile.update`, `retrieve`
- `platform.oauth`: `connections.delete`, `connections.list`, `workspaces.connections.delete`, `workspaces.connections.list`, `workspaces.connections.restore`
- `platform.sessions`: `delete`, `list`, `revokeOthers`
- `platform.stats`: `retrieve`
- `platform.verification`: `resend`, `verify`
- `platform.wellKnown`: `jwks`, `oauthAuthorizationServer`
- `platform.workspaces`: `apiKeys.create`, `apiKeys.delete`, `apiKeys.list`, `apiKeys.presets.list`, `apiKeys.preview`, `apiKeys.retrieve`, `apiKeys.rotate`, `apiKeys.update`, `apiKeys.updateBindings`, `auditFeed.list`, `auditLogs.export`, `auditLogs.list`, `avatar.clear`, `avatar.upload`, `create`, `delete`, `invites.accept`, `invites.create`, `invites.delete`, `invites.list`, `list`, `members.delete`, `members.list`, `members.updateRole`, `policies.actions.catalog`, `policies.create`, `policies.delete`, `policies.list`, `policies.retrieve`, `policies.update`, `retrieve`, `roles.create`, `roles.delete`, `roles.list`, `roles.retrieve`, `roles.update`, `services.disable`, `services.enable`, `services.list`, `services.updateSettings`, `update`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of platform.oauth.connections.list({ limit: 50 })) console.log(item);
const page = await platform.oauth.connections.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await platform.oauth.connections.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { PlatformAuth, NotFoundError, RateLimitError, APIError } from "@productcraft/platform-auth";
const platform = new PlatformAuth();
try {
  await platform.introspect.workspaces.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

## Retries and timeouts

Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` are retried twice by default with exponential backoff and jitter, honouring `Retry-After` up to 60 s. A POST or PATCH without an idempotency key is never retried. Each attempt times out after 60 s, so the worst case with defaults is about 3 minutes; pass `signal: AbortSignal.timeout(ms)` for an overall deadline.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ maxRetries: 3, timeout: 20_000 });
await platform.oauth.connections.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const workspace = await platform.workspaces.create({ display_name: "Acme Corp", slug: "acme-corp" }, { idempotencyKey: "order-1234" });
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await platform.introspect.workspaces.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await platform.introspect.workspaces.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/platform-auth/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
import { createMockFetch } from "@productcraft/platform-auth/testing";
const fetch = createMockFetch();
const platform = new PlatformAuth({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await platform.oauth.connections.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await platform.client.GET("/.well-known/jwks.json");
console.log(data, error);
```

<!-- generated:end -->

## License

MIT

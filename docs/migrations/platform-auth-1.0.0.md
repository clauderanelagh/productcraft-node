# Migrating to @productcraft/platform-auth 1.0

`@productcraft/platform-auth` 1.0 is generated from the Platform OpenAPI spec onto the shared runtime in `@productcraft/core`: resource methods (`platform.workspaces.retrieve()`, `platform.workspaces.apiKeys.create()`), auto-pagination, retries with automatic idempotency keys, typed error classes and typed form uploads.

**Nothing you call today breaks at runtime.** `platformAuth.client` (the typed `openapi-fetch` client) is still there with the same `paths` types, so 0.x call sites keep compiling and running. The one exception at compile time is listed under [Introspecting an API key](#introspecting-an-api-key). Move call sites over at your own pace; this guide shows the 1.0 shape for every call our docs and consumers make. Pinned on `^0.x`? You stay on 0.x until you change the range.

Node 20.3 or later is required (Node 18 is end-of-life).

<!-- snippet-preamble: import { PlatformAuth, NotFoundError, BadRequestError, ConflictError, APIError } from "@productcraft/platform-auth"; declare const yourPlatformUserJwt: string; const platform = new PlatformAuth({ auth: { type: "bearer", token: yourPlatformUserJwt } }); const platformAuth = platform; -->

## Constructing the client

```ts before
const platformAuth = new PlatformAuth({ auth: { type: "apiKey", key: process.env.PCFT_KEY! } });
const admin = new PlatformAuth({ auth: { type: "bearer", token: yourPlatformUserJwt } });
```

```ts
const service = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const admin = new PlatformAuth({ auth: { type: "bearer", token: yourPlatformUserJwt } });
```

- `apiKey` is shorthand for `auth: { type: "apiKey", key }`; `auth` still works (bearer and cookie credentials too). Both fall back to `PRODUCTCRAFT_API_KEY`.
- Platform routes name the workspace by **slug**, as the first positional argument: `platform.workspaces.members.list("acme")`. Nothing is bound on the client. The one id-based route, `platform.stats.retrieve()`, uses `workspaceId` (client option, `PRODUCTCRAFT_WORKSPACE_ID`, or looked up once from a workspace key).
- New options: `maxRetries` (default 2), `timeout` (default 60 s per attempt), `fetch`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`.
- **Browsers:** a client constructed with a key or token in a browser now throws a `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true`.

## Create a workspace

```ts before
const { data } = await platformAuth.client.POST("/v1/workspaces", {
  body: { slug: "acme", display_name: "Acme Inc." },
});
```

```ts
const ws = await platform.workspaces.create({ slug: "acme", display_name: "Acme Inc." });
console.log(ws.id, ws.slug);
```

- The method resolves to the workspace and throws on failure (a taken slug is a `ConflictError`), so there is no `{ data, error }` to unpack.
- An `Idempotency-Key` is generated and reused on every retry.

Reading, updating and deleting take the slug:

```ts before
await platformAuth.client.GET("/v1/workspaces/{workspace_slug}", { params: { path: { workspace_slug: "acme" } } });
```

```ts
const acme = await platform.workspaces.retrieve("acme");
await platform.workspaces.update("acme", { display_name: "Acme Industries" });
for await (const w of platform.workspaces.list()) console.log(w.slug);
console.log(acme.display_name);
```

## Invite members and manage roles

```ts before
const { data } = await platformAuth.client.POST("/v1/workspaces/{workspace_slug}/invites", {
  params: { path: { workspace_slug: "acme" } },
  body: { email: "newhire@acme.com", role: "admin", expires_in_hours: 168 },
});
```

```ts
const invite = await platform.workspaces.invites.create("acme", { email: "newhire@acme.com", role: "admin", expires_in_hours: 168 });
console.log(invite.id);

for await (const member of platform.workspaces.members.list("acme")) console.log(member.username, member.role);
for await (const role of platform.workspaces.roles.list("acme")) console.log(role.name);
```

Member, invite and role ids follow the slug: `platform.workspaces.members.updateRole("acme", accountId, { role: "member" })`, `platform.workspaces.invites.delete("acme", inviteId)`.

## Service activation

```ts before
const { data } = await platformAuth.client.GET("/v1/workspaces/{workspace_slug}/services", {
  params: { path: { workspace_slug: "acme" } },
});
```

```ts
const { data: services } = await platform.workspaces.services.list("acme");
for (const s of services) console.log(s.service, s.enabled);
```

`platform.workspaces.services.enable("acme", "mail")`, `.disable("acme", "mail")` and `.updateSettings("acme", "mail", { default_sender: "noreply@acme.com" })` cover the rest.

## Policies and API keys (CI tokens)

```ts before
const { data: policy } = await platformAuth.client.POST("/v1/workspaces/{workspace_slug}/policies", {
  params: { path: { workspace_slug: "acme" } },
  body: {
    name: "ci-staging-deploy",
    description: "Auth app provisioning + Mail template ops for CI",
    policy: [{ effect: "allow", actions: ["auth.create", "auth.read", "mail.read"], resources: ["*"] }],
  },
});
const { data: pakResult } = await platformAuth.client.POST("/v1/workspaces/{workspace_slug}/api-keys", {
  params: { path: { workspace_slug: "acme" } },
  body: { name: "github-actions-staging-deploy", description: "Deploys acme-staging app from CI", policy_ids: [policy!.id] },
});
```

```ts
const policy = await platform.workspaces.policies.create("acme", {
  name: "ci-staging-deploy",
  description: "Auth app provisioning + Mail template ops for CI",
  policy: [{ effect: "allow", actions: ["auth.create", "auth.read", "mail.read"], resources: ["*"] }],
});
const minted = await platform.workspaces.apiKeys.create("acme", {
  name: "github-actions-staging-deploy",
  description: "Deploys acme-staging app from CI",
  policy_ids: [policy.id],
  expires_in_days: 90,
});
console.log(minted.token); // the plaintext key, returned exactly once
console.log(minted.record.id, minted.record.token_prefix);
```

Listing, rotating and revoking:

```ts before
await platformAuth.client.GET("/v1/workspaces/{workspace_slug}/api-keys", { params: { path: { workspace_slug: "acme" } } });
await platformAuth.client.DELETE("/v1/workspaces/{workspace_slug}/api-keys/{id}", { params: { path: { workspace_slug: "acme", id: "<key id>" } } });
```

```ts
for await (const key of platform.workspaces.apiKeys.list("acme", { include_revoked: false })) console.log(key.name, key.status);
const rotated = await platform.workspaces.apiKeys.rotate("acme", "3f0c3c1e-8a2b-4c55-9d3f-0a1b2c3d4e5f");
await platform.workspaces.apiKeys.delete("acme", "3f0c3c1e-8a2b-4c55-9d3f-0a1b2c3d4e5f", { force: true });
console.log(rotated.token);
```

- The key list is paged (`{ data, pagination }`) and `for await` walks every page. The older bare-array response is gone from the API (platform-auth-api/021), so the generated types only describe the paged shape.
- A workspace key cannot mint, rotate or revoke keys: use a person's session (`auth: { type: "bearer", token }`).

## Which key is this?

```ts
const service = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const me = await service.apiKeys.self();
console.log(me.workspace_id, me.name, me.allowed);
```

`apiKeys.self()` is new in 1.0 (no 0.x equivalent was documented). The other product SDKs use the same route to fill in `workspaceId` when you leave it out.

## Introspecting an API key

conquer-api and other backends that accept workspace keys resolve them through introspection:

```ts before
const { data } = await platformAuth.client.POST("/v1/introspect/api-key", {
  // Required-by-type header param in 0.0.x; the auth middleware overwrote it.
  params: { header: { authorization: "" } },
});
const workspaceId = data?.workspace_id ?? null;
```

```ts
const caller = new PlatformAuth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { is_valid, workspace_id, policy } = await caller.introspect.apiKey();
console.log(is_valid, workspace_id, policy);

// Or, keeping the escape hatch:
const { data } = await caller.client.POST("/v1/introspect/api-key");
```

**This is the one compile-time change.** The spec no longer declares `authorization` as a header parameter (the bearer is the security scheme, since platform-auth-api/021, first published in 0.2.0), so `params: { header: { authorization: "" } }` is a type error on `.client`. Delete that line; the credential is sent exactly as before.

Introspecting a person's session against a workspace moved the same way:

```ts before
await platformAuth.client.GET("/v1/introspect/workspaces/{workspace_id}", { params: { path: { workspace_id: "<workspace-uuid>" } } });
```

```ts
const access = await platform.introspect.workspaces.retrieve("9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b");
console.log(access.policy, access.services);
```

## Signing in a platform user

```ts before
const { data } = await platformAuth.client.POST("/v1/auth/signin", { body: { identifier: "ada@example.com", password: "…" } });
const token = data!.access_token;
```

```ts
const anon = new PlatformAuth();
const { access_token, refresh_token } = await anon.auth.signin({ identifier: "ada@example.com", password: process.env.PASSWORD!, session_duration: 3600 });
const session = new PlatformAuth({ auth: { type: "bearer", token: access_token } });
await session.auth.logoutCurrent();
console.log(refresh_token);
```

`auth.signin`, `auth.signup`, `auth.refresh` and the password-reset calls are public: they never send a credential, even from a keyed client.

## Avatars (form uploads)

```ts before
const form = new FormData();
form.append("file", new Blob([await (await fetch("https://example.com/logo.png")).arrayBuffer()], { type: "image/png" }), "logo.png");
await platformAuth.client.POST("/v1/workspaces/{workspace_slug}/avatar", {
  params: { path: { workspace_slug: "acme" } },
  body: form as never,
});
```

```ts
const file = new File([await (await fetch("https://example.com/logo.png")).arrayBuffer()], "logo.png", { type: "image/png" });
const { avatar_url } = await platform.workspaces.avatar.upload("acme", { file });
await platform.me.avatar.upload({ file });
console.log(avatar_url);
```

The SDK builds the `multipart/form-data` body from typed fields: pass a `File` (keeps its name) or a `Blob`.

## Errors

```ts before
const { data, error } = await platformAuth.client.GET("/v1/workspaces/{workspace_slug}", { params: { path: { workspace_slug: "acme" } } });
if (error) console.error(error);
```

```ts
try {
  await platform.workspaces.retrieve("acme");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
  else if (err instanceof ConflictError) console.log(err.code);
  else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
  else if (err instanceof APIError) console.log(err.status, err.code);
  else throw err;
}
```

Every result carries `lastResponse` (`status`, `headers`, `requestId`), and `.withResponse()` returns `{ data, response, requestId }` when you need the raw response.

## The umbrella package

`productcraft` exposes the same client as `pc.platformAuth`, so everything above applies to `pc.platformAuth.workspaces.retrieve(…)` as well.

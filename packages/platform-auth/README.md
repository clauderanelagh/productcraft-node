# @productcraft/platform-auth

Typed Node.js SDK for [ProductCraft Platform-Auth](https://productcraft.co) — PlatformUser sign-in / sign-up / password reset, workspaces, members + invites, workspace roles + IAM policies, workspace API keys, service activation, and the `/v1/introspect` endpoint every other ProductCraft backend uses to resolve permissions.

```bash
npm install @productcraft/platform-auth
```

Server-side only. The SDK ships a Platform API Key in the `Authorization` header — never embed it in a browser bundle.

## Which SDK do I want?

| If your goal is to … | Reach for |
|---|---|
| Authenticate **your own end-users** in a product you're building (Heimdall apps) | [`@productcraft/heimdall`](https://www.npmjs.com/package/@productcraft/heimdall) |
| Authenticate **your team** into the ProductCraft console + manage workspaces | **this package** |

The two are easy to confuse because both have "auth" in the name. Platform-Auth owns *the ProductCraft account you use to log into productcraft.co*. Heimdall owns *the end-users of products you build on the platform*. Distinct databases, distinct signing keys.

## Quick start

```ts
import { PlatformAuth } from "@productcraft/platform-auth";

const platformAuth = new PlatformAuth({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Resolve the caller's effective policy + enabled services for a workspace
const { data } = await platformAuth.client.GET(
  "/v1/introspect/workspaces/{workspace_id}",
  { params: { path: { workspace_id: "ws_..." } } },
);

// data.policy.statements[…]  — what the caller is allowed to do
// data.enabled_services[…]   — envoi / rally / agora / heimdall / …
```

The `client` is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to `https://api.auth.productcraft.co` and your auth credential.

## Configuration

```ts
new PlatformAuth({
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  baseUrl: "https://api.auth.example.test",  // optional override
  fetch: customFetch,                          // optional
});
```

## Common operations

### Authentication (PlatformUser sign-in)

```ts
// Sign in
await platformAuth.client.POST(
  "/v1/auth/signin",
  { body: { identifier: "you@example.com", password: "..." } },
);

// Refresh tokens
await platformAuth.client.POST("/v1/auth/refresh", { body: { refresh_token } });

// Logout (single session) — or /v1/auth/logout to revoke every refresh token
await platformAuth.client.POST("/v1/auth/logout-current", { body: { refresh_token } });

// Password reset
await platformAuth.client.POST(
  "/v1/auth/password/request-reset",
  { body: { email: "you@example.com" } },
);

await platformAuth.client.POST(
  "/v1/auth/password/reset",
  { body: { token, new_password: "..." } },
);
```

### Introspect — used by every other ProductCraft backend

```ts
// Resolve the bearer of a token: returns account + email_verified_at + workspaces
await platformAuth.client.GET("/v1/introspect");

// Resolve effective policy + enabled services for one workspace
await platformAuth.client.GET(
  "/v1/introspect/workspaces/{workspace_id}",
  { params: { path: { workspace_id: "ws_..." } } },
);

// Resolve a PAK — used internally by services that accept pcft_live_* on routes
await platformAuth.client.GET("/v1/introspect/api-key");
```

The latter two are cached by every consuming service for ~60 seconds. Reach for them from a backend gate; never from a hot request path.

### Workspaces

```ts
// List
await platformAuth.client.GET("/v1/workspaces");

// Create
await platformAuth.client.POST(
  "/v1/workspaces",
  { body: { name: "Acme", slug: "acme" } },
);

// Get / update / delete by slug
await platformAuth.client.GET("/v1/workspaces/{workspace_slug}", { ... });
```

### Members, invites, roles

```ts
// Members
await platformAuth.client.GET("/v1/workspaces/{workspace_slug}/members", { ... });
await platformAuth.client.PATCH(
  "/v1/workspaces/{workspace_slug}/members/{account_id}/role",
  { params: { ... }, body: { role_id: "role_..." } },
);

// Invites
await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/invites",
  { params: { ... }, body: { email: "...", role_id: "..." } },
);
await platformAuth.client.POST("/v1/workspaces/invites/accept", { body: { code } });

// Roles
await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/roles",
  { params: { ... }, body: { name: "billing-admin", policy_ids: ["pol_..."] } },
);
```

### IAM policies

```ts
// List the canonical permission catalogue (what verbs exist for each service)
await platformAuth.client.GET(
  "/v1/workspaces/{workspace_slug}/policies/actions/catalog",
  { ... },
);

// Create a custom policy
await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/policies",
  {
    params: { ... },
    body: {
      name: "Envoi-read-only",
      statements: [
        { effect: "allow", actions: ["envoi.read", "envoi.list"], resources: ["*"] },
      ],
    },
  },
);
```

### Workspace API keys (PATs)

```ts
// Mint a PAK for CI / IaC
await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/api-keys",
  { params: { ... }, body: { name: "github-actions", policy_ids: ["pol_..."] } },
);

// Bind / unbind a PAK to additional workspaces (rare — most PAKs stay
// scoped to the workspace they were minted under)
await platformAuth.client.PUT(
  "/v1/workspaces/{workspace_slug}/api-keys/{id}/bindings",
  { ... },
);
```

### Service activation

```ts
// Enable / disable a service for the workspace (envoi, rally, agora, heimdall, …)
await platformAuth.client.PUT(
  "/v1/workspaces/{workspace_slug}/services/{service}",
  { params: { ... }, body: { enabled: true } },
);

// Per-service workspace settings
await platformAuth.client.PUT(
  "/v1/workspaces/{workspace_slug}/services/{service}/settings",
  { ... },
);
```

### Audit

```ts
// Read the workspace audit log
await platformAuth.client.GET(
  "/v1/workspaces/{workspace_slug}/audit-logs",
  { params: { ... }, query: { limit: 100 } },
);

// Streaming-friendly "recent activity" feed (for the console UI)
await platformAuth.client.GET(
  "/v1/workspaces/{workspace_slug}/audit-feed",
  { ... },
);
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.auth.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

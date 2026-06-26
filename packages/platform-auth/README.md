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
  { params: { path: { workspace_id: "<workspace-uuid>" } } },
);

// data.policy   — flat array of IAM-style { effect, actions, resources } statements
// data.services — string[] of enabled services (envoi / rally / agora / heimdall / …)
```

The `client` is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to `https://api.auth.productcraft.co` and your auth credential.

### Auth modes

| Mode | When to use | Mint/rotate/delete surfaces |
|---|---|---|
| `apiKey` (`pcft_live_*`) | Backend-to-backend reads + introspect calls | ❌ — mint requires a human session |
| `bearer` (PlatformUser JWT) | Anything administrative: workspace create/delete, role/policy authoring, PAK minting, invite mutations | ✅ |
| `cookie` (`auth_token`) | Server-side route handlers running behind the console session | ✅ |

PAKs are workspace-scoped credentials — they read + introspect freely against the workspace they're bound to but cannot mint another PAK or reshape the human-admin surface. Cross-workspace probes by a PAK return the uniform non-member shape (no slug → UUID oracle).

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
// Resolve the bearer of a token: returns account + email_verified_at + workspaces.
// Accepts a `pcft_live_*` PAK too — the response carries a synthetic verified
// account block so downstream `RequireEmailVerifiedGuard`-style gates pass.
await platformAuth.client.GET("/v1/introspect");

// Resolve effective policy + enabled services for one workspace
await platformAuth.client.GET(
  "/v1/introspect/workspaces/{workspace_id}",
  { params: { path: { workspace_id: "<workspace-uuid>" } } },
);

// Resolve a PAK — POST, not GET. Used internally by services that accept
// `pcft_live_*` on routes. Caller's bearer is the PAK being introspected;
// the body is unused (sent as `{}`).
await platformAuth.client.POST("/v1/introspect/api-key");
```

The latter two are cached by every consuming service for ~60 seconds. Reach for them from a backend gate; never from a hot request path.

### Workspaces

```ts
// List — for a PAK caller, this returns exactly the workspace the PAK is
// bound to (member_role / member_role_id are null on that lane).
await platformAuth.client.GET("/v1/workspaces");

// Create — cookie/JWT only. PAKs cannot create workspaces.
await platformAuth.client.POST(
  "/v1/workspaces",
  { body: { display_name: "Acme", slug: "acme" } },
);

// Get / update by slug
await platformAuth.client.GET("/v1/workspaces/{workspace_slug}", { ... });

// Delete — cookie/JWT only. PAKs cannot delete workspaces.
await platformAuth.client.DELETE("/v1/workspaces/{workspace_slug}", { ... });
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

// Create a managed policy. Cookie/JWT only.
await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/policies",
  {
    params: { ... },
    body: {
      name: "mail-read-only",
      description: "Read-only access to all Mail resources",
      policy: [
        { effect: "allow", actions: ["mail.read", "mail.list"], resources: ["*"] },
      ],
    },
  },
);
```

### Workspace API keys (PATs)

PATs bind to one or more managed `workspace_policy` rows. Author the policy first, then mint the key with its id. The inline `policy: [...]` shape is **not** accepted — `policy_ids: [<uuid>]` is required.

Mint / rotate / revoke require a cookie or JWT — a PAK cannot mint another PAK.

```ts
// 1. Author (or reuse) a managed policy
const { data: policy } = await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/policies",
  {
    params: { path: { workspace_slug: "acme" } },
    body: {
      name: "ci-staging-deploy",
      description: "Auth + Mail for the staging pipeline",
      policy: [
        // Permission action prefixes rebranded (heimdall.* → auth.*, envoi.* → mail.*),
        // but resource-URN namespaces intentionally stay pcft:heimdall: / pcft:envoi: —
        // the services still emit those resource prefixes.
        { effect: "allow", actions: ["auth.create", "auth.read", "auth.update"], resources: ["pcft:heimdall:app/*"] },
        { effect: "allow", actions: ["mail.read", "mail.send"], resources: ["*"] },
      ],
    },
  },
);

// 2. Mint a PAT that binds to that policy
const { data: pak } = await platformAuth.client.POST(
  "/v1/workspaces/{workspace_slug}/api-keys",
  {
    params: { path: { workspace_slug: "acme" } },
    body: {
      name: "github-actions-staging-deploy",
      description: "Deploys acme-staging app from CI",
      policy_ids: [policy!.id],
    },
  },
);
// pak.token  — the plaintext `pcft_live_*` value, returned exactly once
// pak.record — public metadata (id, prefix, policies, last_used_at, …)

// Replace the bound policies on an existing PAK (re-runs caller-narrowing
// against the merged statement set)
await platformAuth.client.PATCH(
  "/v1/workspaces/{workspace_slug}/api-keys/{id}/bindings",
  { params: { ... }, body: { policy_ids: ["<new-policy-uuid>"] } },
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

# @productcraft/platform-auth

Typed Node.js SDK for [ProductCraft Platform-Auth](https://productcraft.co) — workspaces, PlatformUser sign-in, API keys, members, invites.

```bash
npm install @productcraft/platform-auth
```

Server-side only. The SDK ships a Platform API Key; never embed it in a browser bundle.

This package targets the **platform-side** identity model — the ProductCraft workspace owners who administer your apps. For end-user authentication on a product you build on top of Heimdall, you want [`@productcraft/heimdall`](https://www.npmjs.com/package/@productcraft/heimdall) instead.

## Quick start

```ts
import { PlatformAuth } from "@productcraft/platform-auth";

const platformAuth = new PlatformAuth({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Resolve the caller's effective policy + enabled services for a workspace
const { data } = await platformAuth.client.GET(
  "/v1/introspect/workspaces/{workspaceId}",
  { params: { path: { workspaceId: "ws_..." } } },
);

// Create a workspace API key for a CI bot
await platformAuth.client.POST(
  "/v1/workspaces/{slug}/api-keys",
  {
    params: { path: { slug: "my-workspace" } },
    body: { name: "ci-bot", permissions: ["envoi.read", "rally.read"] },
  },
);
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

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.auth.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

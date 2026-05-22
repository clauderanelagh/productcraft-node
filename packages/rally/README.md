# @productcraft/rally

Typed Node.js SDK for [ProductCraft Rally](https://productcraft.co) — waitlists, gated signups, and growth experiments.

```bash
npm install @productcraft/rally
```

Server-side only. The SDK ships a Platform API Key; never embed it in a browser bundle.

## Quick start

```ts
import { Rally } from "@productcraft/rally";

const rally = new Rally({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Accept a signup from a marketing site into a waitlist
const { data, error } = await rally.client.POST(
  "/v1/waitlists/{workspaceSlug}/{waitlistSlug}/entries",
  {
    params: { path: { workspaceSlug: "my-workspace", waitlistSlug: "early-access" } },
    body: { email: "alice@example.com" },
  },
);
```

The `client` is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to `https://api.rally.productcraft.co` and your auth credential. Every endpoint in the published OpenAPI spec is reachable through `client.GET`, `client.POST`, etc., with full path-param + body autocomplete.

## Public entry endpoint

`POST /v1/waitlists/:workspaceSlug/:waitlistSlug/entries` is intentionally unauthenticated so a marketing site's `<form>` can POST signups directly. Every other Rally endpoint (admin, approval, exports) requires a PlatformUser cookie or a workspace-scoped PAK.

## Configuration

```ts
new Rally({
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  baseUrl: "https://api.rally.example.test",  // optional override
  fetch: customFetch,                          // optional
});
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.rally.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

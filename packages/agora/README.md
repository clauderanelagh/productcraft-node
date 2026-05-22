# @productcraft/agora

Typed Node.js SDK for [ProductCraft Agora](https://productcraft.co) — landing pages, marketing sites, content blocks.

```bash
npm install @productcraft/agora
```

Server-side only. The SDK ships a Platform API Key; never embed it in a browser bundle.

## Quick start

```ts
import { Agora } from "@productcraft/agora";

const agora = new Agora({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Fetch a published page
const { data } = await agora.client.GET(
  "/v1/sites/{siteSlug}/pages/{pageSlug}",
  { params: { path: { siteSlug: "marketing", pageSlug: "pricing" } } },
);
```

The `client` is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to `https://agora.productcraft.co` and your auth credential. Every endpoint in the OpenAPI spec is reachable through it.

## Configuration

```ts
new Agora({
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  baseUrl: "https://agora.example.test",  // optional override
  fetch: customFetch,                      // optional
});
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://agora.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

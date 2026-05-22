# @productcraft/envoi

Typed Node.js SDK for [ProductCraft Envoi](https://productcraft.co) — transactional email, mailboxes, DKIM, outbound webhooks.

```bash
npm install @productcraft/envoi
```

Server-side only. The SDK ships a Platform API Key in the `Authorization` header; never embed it in a browser bundle.

## Quick start

```ts
import { Envoi } from "@productcraft/envoi";

const envoi = new Envoi({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

const { data, error } = await envoi.client.POST(
  "/v1/mailboxes/{mailboxId}/messages/send",
  {
    params: { path: { mailboxId: "mbx_..." } },
    body: {
      to: "alice@example.com",
      from: "hello@yourbrand.com",
      subject: "Welcome",
      html: "<p>Hi!</p>",
    },
  },
);
```

The `client` property is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to the Envoi production base URL (`https://api.mail.productcraft.co`) and your auth credential. Every endpoint in the published OpenAPI spec is reachable through it — autocomplete in your editor will list paths + method shapes.

## Configuration

```ts
new Envoi({
  // The auth credential the SDK presents to Envoi
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  // Override the prod base URL — useful for staging / a local proxy
  baseUrl: "https://api.mail.example.test",
  // Custom fetch implementation (undici with retry, mock in tests, ...)
  fetch: customFetch,
});
```

## Common operations

```ts
// List mailboxes for the caller's workspace
const { data } = await envoi.client.GET("/v1/mailboxes");

// Create a mailbox
await envoi.client.POST("/v1/mailboxes", {
  body: { name: "Notifications", domain_id: "dom_..." },
});

// Verify a domain
await envoi.client.POST(
  "/v1/domains/{domainId}/verify",
  { params: { path: { domainId: "dom_..." } } },
);

// Configure outbound webhooks
await envoi.client.POST(
  "/v1/mailboxes/{mailboxId}/webhooks",
  {
    params: { path: { mailboxId: "mbx_..." } },
    body: { url: "https://yourapp.com/hooks/envoi", events: ["message.delivered"] },
  },
);
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.mail.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) (types) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (runtime). The nightly `spec-refresh` workflow opens a PR whenever the spec changes; merging publishes a patch bump so type-safe consumers stay current automatically.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

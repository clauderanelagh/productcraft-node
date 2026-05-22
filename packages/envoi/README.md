# @productcraft/envoi

Typed Node.js SDK for [ProductCraft Envoi](https://productcraft.co) — receive-and-store mail platform: send template-rendered messages, manage mailboxes + domains + DKIM, lint templates, track deliveries, configure outbound webhooks, hold suppression lists.

```bash
npm install @productcraft/envoi
```

Server-side only. The SDK ships a Platform API Key in the `Authorization` header — never embed it in a browser bundle.

## Quick start

```ts
import { Envoi } from "@productcraft/envoi";

const envoi = new Envoi({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Send a template-rendered message
const { data, error } = await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/templates/{name}/send",
  {
    params: {
      path: { workspace_id: "ws_...", name: "welcome" },
      // Make retries safe — replays return the original response
      // with `Idempotent-Replay: true` for 24h.
      header: { "Idempotency-Key": "welcome-2026-05-22-alice" },
    },
    body: {
      from: "hello@yourbrand.com",
      to: "alice@example.com",
      subject: "Welcome",          // optional — falls back to template subject
      data: { name: "Alice" },     // rendered into the template
    },
  },
);
```

The `client` property is an [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) instance bound to `https://api.mail.productcraft.co` and your auth credential. Every endpoint in the published OpenAPI spec is reachable through it — your editor's autocomplete lists paths + method shapes + body fields.

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

Every path is workspace-scoped — `{workspace_id}` is the UUID of the workspace that owns the resource, returned by `@productcraft/platform-auth`'s introspect endpoint.

### Templates

```ts
// List templates
await envoi.client.GET(
  "/v1/workspaces/{workspace_id}/templates",
  { params: { path: { workspace_id: "ws_..." } } },
);

// Lint a template before saving
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/templates/lint",
  { params: { path: { workspace_id: "ws_..." } }, body: { html: "..." } },
);

// Preview / render with sample data
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/templates/{name}/render",
  {
    params: { path: { workspace_id: "ws_...", name: "welcome" } },
    body: { data: { name: "Alice" } },
  },
);

// Send to one address (template-rendered)
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/templates/{name}/send",
  { params: { ... }, body: { from, to, data } },
);

// Send the same template to many addresses (batch)
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/templates/{name}/send-batch",
  { params: { ... }, body: { recipients: [{ to, data }, ...] } },
);
```

### Domains + DKIM

```ts
// List domains
await envoi.client.GET("/v1/workspaces/{workspace_id}/domains", { ... });

// Add a domain (then publish the DKIM TXT record Envoi prints)
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/domains",
  { params: { ... }, body: { name: "mail.yourbrand.com" } },
);

// Verify after DNS propagation
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/domains/{domain_id}/verify",
  { params: { path: { workspace_id, domain_id } } },
);
```

### Messages

```ts
// Workspace-wide message listing + filters
await envoi.client.GET(
  "/v1/workspaces/{workspace_id}/messages",
  { params: { path: { workspace_id }, query: { limit: 50 } } },
);

// Read body / attachments / raw RFC822
await envoi.client.GET("/v1/workspaces/{workspace_id}/messages/{id}/body", { ... });
await envoi.client.GET(
  "/v1/workspaces/{workspace_id}/mailboxes/{id}/messages/{mid}/attachments/{position}",
  { ... },
);
```

### Suppression list

```ts
// Add an email to the workspace suppression list
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/suppression",
  { params: { ... }, body: { email: "bounced@example.com", reason: "hard_bounce" } },
);
```

### Outbound webhooks

```ts
// Configure the workspace's default webhook (delivery / open / bounce events)
await envoi.client.PUT(
  "/v1/workspaces/{workspace_id}/webhooks/default",
  {
    params: { ... },
    body: { url: "https://yourapp.com/hooks/envoi", events: ["message.delivered"] },
  },
);

// Per-domain webhook overrides + secret rotation
await envoi.client.POST(
  "/v1/workspaces/{workspace_id}/webhooks/domains/{domain_id}/rotate-secret",
  { ... },
);
```

## Idempotency

Send endpoints accept an `Idempotency-Key` header (1–256 chars, `[A-Za-z0-9_\-:]`). Retries with the same key + same body replay the original response with `Idempotent-Replay: true` for 24h. Same key + different body returns `409 IDEMPOTENCY_KEY_REUSE`.

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.mail.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) (types) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (runtime). The nightly `spec-refresh` workflow opens a PR whenever the spec changes; merging publishes a patch bump so type-safe consumers stay current automatically.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

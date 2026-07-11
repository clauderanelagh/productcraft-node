# @productcraft/trawl

Typed Node.js / TypeScript client for **ProductCraft Trawl** — AI web
extraction. Hand Trawl a JSON Schema plus a natural-language description
(and optional seed URLs); a browser agent navigates the live web, extracts
data conforming to your schema, and the result is delivered to a
preconfigured HMAC-signed webhook.

Generated from the production OpenAPI spec, so every endpoint is reachable
and fully typed.

## Install

```sh
npm install @productcraft/trawl
```

Or use the umbrella package to get every ProductCraft surface from one
import: `npm install productcraft`.

## Usage

```ts
import { Trawl } from "@productcraft/trawl";

const trawl = new Trawl({ auth: { type: "apiKey", key: process.env.PCFT_KEY! } });

// Submit an extraction job (workspace-scoped).
const { data, error } = await trawl.client.POST(
  "/v1/workspaces/{workspaceId}/jobs",
  {
    params: { path: { workspaceId: "ws_..." } },
    body: {
      description: "Extract the product title and price from each page.",
      json_schema: {
        type: "object",
        properties: { title: { type: "string" }, price: { type: "number" } },
        required: ["title"],
      },
      suggested_urls: ["https://example.com/product"],
    },
  },
);

if (error) throw error;
console.log(data.id, data.status); // → "job_...", "queued"
```

Poll `GET /v1/workspaces/{workspaceId}/jobs/{id}` for the result, or
register a webhook (`POST /v1/workspaces/{workspaceId}/webhooks`) to have
the terminal result delivered to you. Job submission is rate-limited per
workspace (default 10/min); a `429` carries a `Retry-After` header.

## Auth

Pass a workspace API key (`pcft_live_*`) as `{ type: "apiKey", key }`. The
client sets `Authorization: Bearer <key>` on every request.

## License

MIT

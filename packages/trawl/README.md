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

// Reads PRODUCTCRAFT_API_KEY from the environment
const trawl = new Trawl();

// Submit an extraction job (workspace-scoped).
const { data, error } = await trawl.client.POST(
  "/v1/workspaces/{workspaceId}/jobs",
  {
    params: { path: { workspaceId: "<workspace-uuid>" } },
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
console.log(data.id, data.status); // → "<job-uuid>", "queued"
```

Poll `GET /v1/workspaces/{workspaceId}/jobs/{id}` for the result, or
register a webhook (`POST /v1/workspaces/{workspaceId}/webhooks`) to have
the terminal result delivered to you. Job submission is rate-limited per
workspace (default 10/min); a `429` carries a `Retry-After` header.

## Credentials from the environment

Server-side, omit `auth` and the client reads your workspace key from the environment:

```bash
# .env
PRODUCTCRAFT_API_KEY=pcft_live_...
```

- An explicit `auth` always wins over the environment.
- Hosts are never read from the environment. Override them in code with `baseUrl`.
- This is a server-only fallback. Never put a key in `NEXT_PUBLIC_*` or any other variable a bundler inlines into browser code.

## Auth

Pass a workspace API key (`pcft_live_*`) as `{ type: "apiKey", key }`, or omit
`auth` to use `PRODUCTCRAFT_API_KEY` (see above). The client sets `Authorization: Bearer <key>` on every request.

## License

MIT

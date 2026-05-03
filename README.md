# productcraft (Node.js / TypeScript)

Node.js + TypeScript SDK for the [ProductCraft](https://productcraft.co) APIs — Heimdall (auth-as-a-service), Envoi (transactional email), Rally (waitlists), Agora (social), and Platform-Auth (workspace identity).

> **Status:** v0 — every endpoint reachable via the typed `openapi-fetch` client; Stripe-style ergonomic resource wrappers ship in v0.1+.

## Install

```bash
pnpm add productcraft
# or
npm install productcraft
# or
yarn add productcraft
```

Requires Node 18+.

## Quick start

```ts
import { ProductCraft } from "productcraft";

const pc = new ProductCraft({
  auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! },
});

// Every endpoint declared in the OpenAPI spec is reachable through
// the typed underlying client. Path parameters, request body, and
// response are all type-checked.
const { data, error } = await pc.envoi.client.POST(
  "/v1/mailboxes/{mailboxId}/messages/send",
  {
    params: { path: { mailboxId: "mb_123" } },
    body: { to: "alice@example.com", subject: "Welcome", body: "..." },
  },
);

if (error) throw error;
console.log(data.id);
```

The Stripe-style ergonomic surface (`pc.envoi.messages.send({ to, subject, body })`) ships in v0.1+. Until then, the typed underlying client guarantees every endpoint is reachable from day one.

### Per-surface imports

For tighter dependency footprints (e.g. a server that only sends email):

```ts
import { Envoi } from "productcraft/envoi";

const envoi = new Envoi({ auth: { type: "apiKey", key: "..." } });
```

## Five surfaces, one SDK

| Module | Default URL |
|---|---|
| `productcraft/heimdall` — Heimdall Consumer + Admin | `https://api.heimdall.productcraft.co` |
| `productcraft/envoi` — Envoi (mailbox-api) | `https://api.mail.productcraft.co` |
| `productcraft/rally` — Rally (waitlists) | `https://api.rally.productcraft.co` |
| `productcraft/agora` — Agora (social) | `https://agora.productcraft.co` |
| `productcraft/platform-auth` — Platform-Auth (workspaces) | `https://api.auth.productcraft.co` |

## Authentication

```ts
type PCAuth =
  | { type: "apiKey"; key: string }   // pcft_live_* — server-side only
  | { type: "bearer"; token: string } // pre-resolved JWT
  | { type: "cookie"; value: string } // dev / E2E
```

Auth is added as `Authorization: Bearer …` (or `Cookie: auth_token=…`) on every outbound request via an `openapi-fetch` middleware.

## How this SDK is built

The SDK is **generated from the live OpenAPI specs** at each prod API's `/docs-json` endpoint:

1. **Specs vendored** under `Specs/<surface>.json`.
2. **`openapi-typescript`** generates `src/_generated/<surface>.d.ts` (types only — no runtime).
3. A **thin hand-written class per surface** (`Heimdall`, `Envoi`, …) wires `openapi-fetch` with the generated `paths` types + the configured auth + base URL.
4. **CI cron** (`.github/workflows/spec-refresh.yml`) refetches specs nightly, regenerates types, opens a PR if anything changed.

This means: the SDK tracks API surface drift automatically, the maintainer surface is small (specs + facades), and consumers always get the latest types.

## Local development

```bash
git clone https://github.com/clauderanelagh/productcraft-node
cd productcraft-node
pnpm install

pnpm run refresh-specs   # pull /docs-json from prod into Specs/
pnpm run codegen         # regenerate src/_generated/
pnpm run build
pnpm run test
```

## License

[MIT](LICENSE).

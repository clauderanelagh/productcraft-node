# ProductCraft Node SDK

Node.js + TypeScript SDKs for the [ProductCraft](https://productcraft.co) APIs — Auth (auth-as-a-service), Mail (transactional email), Waitlist (waitlist management), Social (social-as-a-service), and Platform-Auth (workspace identity).

Five per-product packages plus a `productcraft` umbrella. Install just the one you need.

> **Status:** v0 — every endpoint reachable via the typed `openapi-fetch` client; Stripe-style ergonomic resource wrappers ship in v0.1+.

## Install

Pick the package(s) you need:

```bash
# Just one product
npm install @productcraft/auth
npm install @productcraft/mail
npm install @productcraft/waitlist
npm install @productcraft/social
npm install @productcraft/platform-auth

# Or the all-in-one umbrella
npm install productcraft
```

Requires Node 18+.

## Quick start — single product

```ts
import { Mail } from "@productcraft/mail";

const mail = new Mail({
  auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! },
});

const { data, error } = await mail.client.POST(
  "/v1/mailboxes/{mailboxId}/messages/send",
  {
    params: { path: { mailboxId: "mb_123" } },
    body: { to: "alice@example.com", subject: "Welcome", body: "..." },
  },
);

if (error) throw error;
console.log(data.id);
```

## Quick start — all products via umbrella

```ts
import { ProductCraft } from "productcraft";

const pc = new ProductCraft({
  auth: { type: "apiKey", key: process.env.PRODUCTCRAFT_API_KEY! },
});

await pc.mail.client.POST("/v1/mailboxes/{mailboxId}/messages/send", { ... });
await pc.auth.client.POST("/v1/auth/signin", { ... });
```

The Stripe-style ergonomic surface (`mail.messages.send({ to, subject, body })`) ships in v0.1+. Until then, the typed underlying client guarantees every endpoint is reachable from day one.

## The packages

| Package | Default URL |
|---|---|
| [`@productcraft/auth`](packages/auth) — Auth Consumer + Admin | `https://api.auth.productcraft.co` |
| [`@productcraft/mail`](packages/mail) — Mail (transactional email) | `https://api.mail.productcraft.co` |
| [`@productcraft/waitlist`](packages/waitlist) — Waitlist (waitlist management) | `https://api.waitlist.productcraft.co` |
| [`@productcraft/social`](packages/social) — Social (social-as-a-service) | `https://social.productcraft.co` |
| [`@productcraft/platform-auth`](packages/platform-auth) — Platform-Auth (workspaces) | `https://api.platform-auth.productcraft.co` |
| [`@productcraft/core`](packages/core) — shared auth + transport (dep of all the above) | — |
| [`productcraft`](packages/umbrella) — convenience umbrella, depends on all five | — |

## Authentication

```ts
type PCAuth =
  | { type: "apiKey"; key: string }   // pcft_live_* — server-side only
  | { type: "bearer"; token: string } // pre-resolved JWT
  | { type: "cookie"; value: string } // dev / E2E
```

Auth is added as `Authorization: Bearer …` (or `Cookie: auth_token=…`) on every outbound request via an `openapi-fetch` middleware.

## How these SDKs are built

The SDKs are **generated from the live OpenAPI specs** at each prod API's `/docs-json` endpoint:

1. **Specs vendored** under `Specs/<surface>.json` at the repo root.
2. **`openapi-typescript`** generates `packages/<surface>/src/_generated.d.ts` (types only — no runtime).
3. A **thin hand-written class per surface** wires `openapi-fetch` with the generated `paths` types + auth + base URL.
4. **CI cron** (`.github/workflows/spec-refresh.yml`) refetches specs nightly. When a surface's spec changes, it emits a Changesets entry that triggers a patch bump for just that package.

This means: per-product packages move independently; consumers only see version bumps for the surfaces they use.

## Local development

```bash
git clone https://github.com/clauderanelagh/productcraft-node
cd productcraft-node
pnpm install

pnpm run refresh-specs   # pull /docs-json from prod into Specs/
pnpm run codegen         # regenerate packages/<surface>/src/_generated.d.ts
pnpm run build
pnpm run test
pnpm run lint
```

## Versioning + releases

Per-package SemVer. Spec-refresh PRs add a Changesets entry that triggers a patch bump on just the affected surface (and a cascading patch on the `productcraft` umbrella). The release workflow opens a "Version Packages" PR collecting pending bumps; merging it publishes the affected packages to npm via Trusted Publishing (OIDC, no token).

## License

[MIT](LICENSE).

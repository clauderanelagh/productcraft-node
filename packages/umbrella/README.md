# productcraft

All-in-one Node.js / TypeScript SDK for the [ProductCraft](https://productcraft.co) platform. One install, one auth credential, every surface.

```bash
npm install productcraft
```

## When to use this

Install **`productcraft`** when you call more than one ProductCraft API from the same backend (e.g. you mint Heimdall tokens *and* send transactional email through Envoi). It's a thin wrapper that instantiates one of each per-surface client and shares your auth credential across them.

Install the **per-product packages** when you only need one:

- `@productcraft/heimdall` — customer auth + EndUsers
- `@productcraft/envoi` — transactional email
- `@productcraft/rally` — waitlists
- `@productcraft/agora` — landing pages
- `@productcraft/platform-auth` — workspace administration

The per-product packages are leaner (no bundled deps for the surfaces you don't use).

## Quick start

```ts
import { ProductCraft } from "productcraft";

const pc = new ProductCraft({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Heimdall — sign in an EndUser through the BFF flow
const consumer = pc.heimdall.consumer("my-app-slug");
const tokens = await consumer.auth.signin({
  identifier: "alice@example.com",
  password: "...",
});

// Envoi — send a transactional email from the same backend
await pc.envoi.client.POST(
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

// Rally — accept a waitlist signup
await pc.rally.client.POST(
  "/v1/waitlists/{workspaceSlug}/{waitlistSlug}/entries",
  {
    params: { path: { workspaceSlug: "my-workspace", waitlistSlug: "early-access" } },
    body: { email: "alice@example.com" },
  },
);
```

## What gets instantiated

```ts
class ProductCraft {
  readonly heimdall: Heimdall;       // @productcraft/heimdall
  readonly envoi: Envoi;              // @productcraft/envoi
  readonly rally: Rally;              // @productcraft/rally
  readonly agora: Agora;              // @productcraft/agora
  readonly platformAuth: PlatformAuth; // @productcraft/platform-auth
}
```

Each is the same class you'd get from installing its per-product package directly — `pc.heimdall` is `new Heimdall(config)`, etc. The classes are re-exported so you can refer to their types: `import type { Heimdall } from "productcraft"`.

## Configuration

```ts
new ProductCraft({
  // Shared auth credential — applied to every surface
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },

  // Shared overrides (optional)
  baseUrl: "...",   // RARELY useful — surfaces have different base URLs
  fetch: customFetch,

  // Per-surface overrides — useful for dev / staging
  heimdall:     { baseUrl: "https://api.heimdall.example.test" },
  envoi:        { baseUrl: "https://api.mail.example.test" },
  rally:        { baseUrl: "https://api.rally.example.test" },
  agora:        { baseUrl: "https://agora.example.test" },
  platformAuth: { baseUrl: "https://api.auth.example.test" },
});
```

A per-surface override is merged over the shared config — you can change just the base URL of one surface (e.g. pointing Heimdall at a staging cluster while Envoi stays on prod) without restating the whole credential.

## How these SDKs are built

Every surface is generated from its live OpenAPI spec via [`openapi-typescript`](https://openapi-ts.dev/) (types) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (runtime). Heimdall additionally has a hand-written ergonomic layer (`consumer(slug).auth.signin(...)`) on top of the generated client; the other surfaces ship the `client` directly for now.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

# productcraft

All-in-one Node.js / TypeScript SDK for the [ProductCraft](https://productcraft.co) platform. One install, one auth credential, every surface.

```bash
npm install productcraft
```

## When to use this

Install **`productcraft`** when you call more than one ProductCraft API from the same backend (e.g. you mint Auth tokens *and* send transactional email through Mail). It's a thin wrapper that instantiates one of each per-surface client and shares your auth credential across them.

Install the **per-product packages** when you only need one:

- `@productcraft/auth` — customer auth + EndUsers
- `@productcraft/mail` — receive-and-store mail: template sends, mailboxes, domains + DKIM, webhooks
- `@productcraft/waitlist` — waitlists: public-form signups, variants, referrals, leaderboard, approvals, signed webhooks
- `@productcraft/social` — social-as-a-service: communities, posts, feeds, stories, conversations, notifications, moderation
- `@productcraft/platform-auth` — PlatformUser auth + workspaces + members + roles + IAM policies + PAKs + introspect

The per-product packages are leaner (no bundled deps for the surfaces you don't use).

## Quick start

```ts
import { ProductCraft } from "productcraft";

const pc = new ProductCraft({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Auth — sign in an EndUser through the BFF flow
const consumer = pc.auth.consumer("my-app-slug");
const tokens = await consumer.auth.signin({
  identifier: "alice@example.com",
  password: "...",
});

// Mail — send a template-rendered transactional email from the same backend.
// The mailboxes-keyed send path does not exist; sends are workspace-scoped
// template renders.
await pc.mail.client.POST(
  "/v1/workspaces/{workspace_id}/templates/{name}/send",
  {
    params: {
      path: { workspace_id: "<workspace-uuid>", name: "welcome" },
      header: { "Idempotency-Key": "welcome-2026-05-22-alice" },
    },
    body: {
      from: "hello@yourbrand.com",
      to: "alice@example.com",
      data: { name: "Alice" },
    },
  },
);

// Waitlist — accept a waitlist signup
await pc.waitlist.client.POST(
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
  readonly auth: Auth;       // @productcraft/auth
  readonly mail: Mail;              // @productcraft/mail
  readonly waitlist: Waitlist;              // @productcraft/waitlist
  readonly social: Social;              // @productcraft/social
  readonly platformAuth: PlatformAuth; // @productcraft/platform-auth
}
```

Each is the same class you'd get from installing its per-product package directly — `pc.auth` is `new Auth(config)`, etc. The classes are re-exported so you can refer to their types: `import type { Auth } from "productcraft"`.

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
  auth:     { baseUrl: "https://api.auth.example.test" },
  mail:        { baseUrl: "https://api.mail.example.test" },
  waitlist:        { baseUrl: "https://api.waitlist.example.test" },
  social:        { baseUrl: "https://social.example.test" },
  platformAuth: { baseUrl: "https://api.auth.example.test" },
});
```

A per-surface override is merged over the shared config — you can change just the base URL of one surface (e.g. pointing Auth at a staging cluster while Mail stays on prod) without restating the whole credential.

## How these SDKs are built

Every surface is generated from its live OpenAPI spec via [`openapi-typescript`](https://openapi-ts.dev/) (types) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) (runtime). Auth additionally has a hand-written ergonomic layer (`consumer(slug).auth.signin(...)`) on top of the generated client; the other surfaces ship the `client` directly for now.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

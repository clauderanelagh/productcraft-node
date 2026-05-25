# @productcraft/rally

Typed Node.js SDK for [ProductCraft Rally](https://productcraft.co) — waitlist management: public-form signups, variants for A/B/n landing pages, referrals, position + leaderboard, approval workflow with invite-to-app, signed outbound webhooks, CSV export.

```bash
npm install @productcraft/rally
```

The waitlist-entries endpoint can be called unauthenticated from a marketing-site form. Every other endpoint (admin, approval, analytics, exports, webhooks) requires a PlatformUser cookie or a workspace-scoped PAK (`pcft_live_…`).

## Quick start — accept a signup from a public form

```ts
import { Rally } from "@productcraft/rally";

// No auth — public surface
const rally = new Rally();

const { data, error } = await rally.client.POST(
  "/v1/waitlists/{workspace_slug}/{waitlist_slug}/entries",
  {
    params: { path: { workspace_slug: "acme", waitlist_slug: "early-access" } },
    body: {
      email: "alice@example.com",
      name: "Alice",
      referrer: "twitter",
      referral_code: "ada-123",     // optional — bumps the referrer's position
      metadata: { plan_interest: "pro" },
    },
  },
);
```

The response includes the entry's id + assigned position. Round-trip the `id` into your "thanks" page so the visitor can share their own referral link.

If the waitlist has `settings.recaptcha_site_key` set, also pass a `recaptcha_token` from your client side.

## Quick start — workspace-admin (authenticated)

```ts
import { Rally } from "@productcraft/rally";

const rally = new Rally({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});

// Create a waitlist — body uses `display_name`, not `name`.
const { data } = await rally.client.POST(
  "/v1/workspaces/{workspace_id}/waitlists",
  {
    params: { path: { workspace_id: "<workspace-uuid>" } },
    body: { display_name: "Early Access", slug: "early-access" },
  },
);
```

`{workspace_id}` is the workspace UUID returned by `@productcraft/platform-auth`'s introspect endpoint.

## Configuration

```ts
new Rally({
  // Optional: required for workspace-admin calls. Public submit works without auth.
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  baseUrl: "https://api.rally.example.test",   // optional override
  fetch: customFetch,                            // optional
});
```

## Common operations

### Public surface

```ts
// Read the waitlist's public metadata (name, position-window, active variant, ...)
await rally.client.GET(
  "/v1/waitlists/{workspace_slug}/{waitlist_slug}",
  { params: { ... } },
);

// Read the public leaderboard (when enabled per-waitlist)
await rally.client.GET(
  "/v1/waitlists/{workspace_slug}/{waitlist_slug}/leaderboard",
  { params: { ... } },
);
```

### Entries (workspace-admin)

```ts
// List entries
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries",
  { params: { path: { workspace_id, waitlist_id }, query: { limit: 50 } } },
);

// Count
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/count",
  { ... },
);

// Approve / reject in bulk
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/bulk",
  { params: { ... }, body: { ids: [...], action: "approve" } },
);

// Send an invite (e.g. into a Heimdall app)
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/{entry_id}/invite-to-app",
  { params: { ... }, body: { /* app + role + invite_template */ } },
);

// Export to CSV
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/entries/export.csv",
  { ... },
);
```

### Variants (A/B/n landing pages)

Variants split two ways: `kind: "ab"` for split-traffic A/B/n tests, or `kind: "locale"` for per-locale copy switching. Pick one; the body shape is `{ kind, slug, locale? }`.

```ts
// A/B variant
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/variants",
  {
    params: { ... },
    body: { kind: "ab", slug: "headline-b" },
  },
);

// Locale variant
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/variants",
  {
    params: { ... },
    body: { kind: "locale", slug: "pt-br", locale: "pt-BR" },
  },
);
```

Front-end picks up the active variant from `GET /v1/waitlists/:workspace_slug/:waitlist_slug` and round-trips its id back in the entry submission via the `variant_id` field — Rally computes per-variant conversion without a separate impressions table.

### Analytics

```ts
// Conversion + per-variant counts
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/analytics",
  { ... },
);

// Timeseries — `since` is an ISO-8601 timestamp. There are no
// `bucket` / `lookback` query params.
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/waitlists/{waitlist_id}/analytics/timeline",
  {
    params: {
      path: { ... },
      query: { since: "2026-05-01T00:00:00Z" },
    },
  },
);
```

### Webhooks

```ts
// Subscribe to entry.created / entry.approved / entry.rejected
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/webhooks",
  { params: { ... }, body: { url: "https://yourapp.com/hooks/rally", events: ["entry.created"] } },
);

// Rotate the signing secret without disabling the webhook
await rally.client.POST(
  "/v1/workspaces/{workspace_id}/webhooks/{id}/rotate-secret",
  { ... },
);

// Replay a delivery from history
await rally.client.GET(
  "/v1/workspaces/{workspace_id}/webhooks/{id}/deliveries",
  { ... },
);
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.rally.productcraft.co/docs-json` via [`openapi-typescript`](https://openapi-ts.dev/) + [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). The nightly `spec-refresh` workflow opens a PR whenever the spec changes.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

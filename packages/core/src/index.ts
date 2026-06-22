/**
 * Shared transport + auth plumbing used by every surface client.
 *
 * Each surface package (`@productcraft/heimdall`, `@productcraft/envoi`,
 * ...) defines a thin class around `openapi-fetch` plus the generated
 * `paths` types from its own `_generated.d.ts`. The class delegates
 * wire I/O to `openapi-fetch`, but exposes a Stripe-style ergonomic
 * surface where callers reach for `pc.envoi.messages.send(...)` rather
 * than the underlying `client.POST("/v1/...")` shape.
 *
 * v0 ships only the underlying `client` (named `client` on each
 * surface) — every endpoint is reachable through it. Ergonomic
 * resource surfaces land in v0.1+ as we hand-roll them.
 */

import createClient, { type Client, type Middleware } from "openapi-fetch";

/**
 * The auth credential the SDK presents to ProductCraft APIs.
 *
 * - `apiKey` — Platform API Key (`pcft_live_*`). Server-side only;
 *   never embed in a shipped browser bundle.
 * - `bearer` — pre-resolved JWT (e.g. a Heimdall app-scoped EndUser
 *   token your backend minted and shipped to the device).
 * - `cookie` — captured `auth_token` cookie value. Mostly useful in
 *   dev / E2E tests where you've already signed in.
 */
export type PCAuth =
  | { type: "apiKey"; key: string }
  | { type: "bearer"; token: string }
  | { type: "cookie"; value: string };

export interface PCClientConfig {
  auth?: PCAuth;
  /** Override the prod base URL — useful for dev / staging. */
  baseUrl?: string;
  /** Custom fetch (e.g. node-fetch with retries, undici, ...). */
  fetch?: typeof fetch;
}

/**
 * Default prod base URL per surface.
 *
 * Pointed at the canonical post-rebrand domains (Rally→Waitlist,
 * Envoi→Mail, Agora→Feed→Social, Heimdall→Auth). The old aliases
 * (api.rally, agora/feed, api.heimdall, api.users) stay live during the
 * deprecation window, so this is a non-breaking retarget.
 *
 * Two important domain moves in this update:
 *   - platformAuth: api.auth → api.platform-auth. The platform identity
 *     layer vacated api.auth so the customer-facing Auth product could
 *     take it; pointing the SDK at api.auth here would now hit the wrong
 *     service.
 *   - heimdall (the Auth product): api.users → api.auth (its new
 *     canonical host).
 *
 * The surface KEYS (rally/agora/heimdall) are intentionally kept until
 * the v1.0.0 public-API rename.
 */
export const PC_BASE_URL = {
  platformAuth: "https://api.platform-auth.productcraft.co",
  heimdall: "https://api.auth.productcraft.co",
  envoi: "https://api.mail.productcraft.co",
  rally: "https://api.waitlist.productcraft.co",
  agora: "https://social.productcraft.co",
} as const;

/**
 * Build an `openapi-fetch` middleware that adds the configured auth
 * credential as a header on every outbound request.
 */
export function authMiddleware(auth: PCAuth | undefined): Middleware {
  return {
    async onRequest({ request }) {
      if (!auth) return undefined;
      switch (auth.type) {
        case "apiKey":
          request.headers.set("Authorization", `Bearer ${auth.key}`);
          break;
        case "bearer":
          request.headers.set("Authorization", `Bearer ${auth.token}`);
          break;
        case "cookie":
          request.headers.set("Cookie", `auth_token=${auth.value}`);
          break;
      }
      return request;
    },
  };
}

/**
 * Construct an `openapi-fetch` client for a surface. Each surface
 * package calls this with its own generated `paths` type and default
 * base URL. The returned client is the v0 surface — every endpoint is
 * reachable through `client.GET(...)`, `client.POST(...)`, etc.
 */
export function makeClient<TPaths extends object>(
  defaultBaseUrl: string,
  config: PCClientConfig = {},
): Client<TPaths> {
  const client = createClient<TPaths>({
    baseUrl: config.baseUrl ?? defaultBaseUrl,
    fetch: config.fetch,
  });
  client.use(authMiddleware(config.auth));
  return client;
}

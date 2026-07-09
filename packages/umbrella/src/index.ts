/**
 * `productcraft` — single import that gives you every API surface.
 *
 * ```ts
 * import { ProductCraft } from "productcraft";
 *
 * const pc = new ProductCraft({
 *   auth: { type: "apiKey", key: "pcft_live_..." },
 * });
 *
 * const { data, error } = await pc.mail.client.POST(
 *   "/v1/mailboxes/{mailboxId}/messages/send",
 *   { params: { path: { mailboxId: "..." } }, body: { ... } }
 * );
 * ```
 *
 * If you only need one product, install its package directly:
 * `npm i @productcraft/auth` (and skip this umbrella).
 */

import { Auth } from "@productcraft/auth";
import { Mail } from "@productcraft/mail";
import { Waitlist } from "@productcraft/waitlist";
import { Social } from "@productcraft/social";
import { PlatformAuth } from "@productcraft/platform-auth";
import type { PCClientConfig } from "@productcraft/core";

export { Auth, Mail, Waitlist, Social, PlatformAuth };
export { PC_BASE_URL, type PCAuth, type PCClientConfig } from "@productcraft/core";

/**
 * Per-surface config overrides. Nested under `overrides` (rather than
 * flat keys) because the Auth surface's natural key — `auth` — would
 * collide with the shared `auth` credential field on `PCClientConfig`.
 */
export interface ProductCraftOverrides {
  auth?: PCClientConfig;
  mail?: PCClientConfig;
  waitlist?: PCClientConfig;
  social?: PCClientConfig;
  platformAuth?: PCClientConfig;
}

/**
 * The umbrella class — instantiates one of each surface client, all
 * sharing the same auth + fetch + (optional) baseUrl override config.
 *
 * Surface-specific overrides are also possible:
 * `new ProductCraft({ auth, overrides: { mail: { baseUrl: "..." } } })`.
 */
export class ProductCraft {
  public readonly auth: Auth;
  public readonly mail: Mail;
  public readonly waitlist: Waitlist;
  public readonly social: Social;
  public readonly platformAuth: PlatformAuth;

  constructor(
    config: PCClientConfig & { overrides?: ProductCraftOverrides } = {},
  ) {
    const { overrides, ...shared } = config;
    this.auth = new Auth({ ...shared, ...overrides?.auth });
    this.mail = new Mail({ ...shared, ...overrides?.mail });
    this.waitlist = new Waitlist({ ...shared, ...overrides?.waitlist });
    this.social = new Social({ ...shared, ...overrides?.social });
    this.platformAuth = new PlatformAuth({ ...shared, ...overrides?.platformAuth });
  }
}

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
 * const { data, error } = await pc.envoi.client.POST(
 *   "/v1/mailboxes/{mailboxId}/messages/send",
 *   { params: { path: { mailboxId: "..." } }, body: { ... } }
 * );
 * ```
 *
 * Per-surface entry points are also exported for tighter dependency
 * footprints — `import { Heimdall } from "productcraft/heimdall"`.
 */

import { Heimdall } from "./heimdall.js";
import { Envoi } from "./envoi.js";
import { Rally } from "./rally.js";
import { Agora } from "./agora.js";
import { PlatformAuth } from "./platform-auth.js";
import type { PCClientConfig } from "./_core.js";

export { Heimdall, Envoi, Rally, Agora, PlatformAuth };
export { PC_BASE_URL, type PCAuth, type PCClientConfig } from "./_core.js";

/**
 * The umbrella class — instantiates one of each surface client, all
 * sharing the same auth + fetch + (optional) baseUrl override config.
 *
 * Surface-specific overrides are also possible:
 * `new ProductCraft({ auth, heimdall: { baseUrl: "..." } })`.
 */
export class ProductCraft {
  public readonly heimdall: Heimdall;
  public readonly envoi: Envoi;
  public readonly rally: Rally;
  public readonly agora: Agora;
  public readonly platformAuth: PlatformAuth;

  constructor(
    config: PCClientConfig & {
      heimdall?: PCClientConfig;
      envoi?: PCClientConfig;
      rally?: PCClientConfig;
      agora?: PCClientConfig;
      platformAuth?: PCClientConfig;
    } = {},
  ) {
    const {
      heimdall: hOverride,
      envoi: eOverride,
      rally: rOverride,
      agora: aOverride,
      platformAuth: pOverride,
      ...shared
    } = config;
    this.heimdall = new Heimdall({ ...shared, ...hOverride });
    this.envoi = new Envoi({ ...shared, ...eOverride });
    this.rally = new Rally({ ...shared, ...rOverride });
    this.agora = new Agora({ ...shared, ...aOverride });
    this.platformAuth = new PlatformAuth({ ...shared, ...pOverride });
  }
}

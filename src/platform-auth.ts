import type { paths } from "./_generated/platform-auth.js";
import { makeClient, PC_BASE_URL, type PCClientConfig } from "./_core.js";

/**
 * PlatformAuth — workspace identity surface (sign in, members, roles,
 * audit). See README. `make()` returns a typed `openapi-fetch` client
 * for every endpoint declared in `Specs/platform-auth.json`.
 */
export class PlatformAuth {
  public readonly client: ReturnType<typeof makeClient<paths>>;

  constructor(config: PCClientConfig = {}) {
    this.client = makeClient<paths>(PC_BASE_URL.platformAuth, config);
  }
}

export type { paths } from "./_generated/platform-auth.js";

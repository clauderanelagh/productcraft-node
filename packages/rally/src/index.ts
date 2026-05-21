import type { paths } from "./_generated.js";
import { makeClient, PC_BASE_URL, type PCClientConfig } from "@productcraft/core";

/**
 * Rally — typed `openapi-fetch` client for every endpoint in
 * `Specs/rally.json`. Reach for `client.GET("/v1/...")` or
 * `client.POST(...)`; request / response types come from the
 * generated `paths` interface.
 */
export class Rally {
  /** The underlying typed client. v0 surface — every endpoint reachable. */
  public readonly client: ReturnType<typeof makeClient<paths>>;

  constructor(config: PCClientConfig = {}) {
    this.client = makeClient<paths>(PC_BASE_URL.rally, config);
  }
}

export type { paths } from "./_generated.js";

import type { paths } from "./_generated/heimdall.js";
import { makeClient, PC_BASE_URL, type PCClientConfig } from "./_core.js";

/**
 * Heimdall — see README. `make()` returns a typed
 * `openapi-fetch` client for every endpoint declared in
 * `Specs/heimdall.json`. Reach for `client.GET("/v1/...")` or
 * `client.POST(...)`; the request/response types come from the
 * generated `paths` interface.
 */
export class Heimdall {
  /** The underlying typed client. v0 surface — every endpoint reachable. */
  public readonly client: ReturnType<typeof makeClient<paths>>;

  constructor(config: PCClientConfig = {}) {
    this.client = makeClient<paths>(PC_BASE_URL.heimdall, config);
  }
}

export type { paths } from "./_generated/heimdall.js";

/**
 * Hand-written base of the generated `Auth` class (SURFACES `root` in
 * scripts/gen-sdk.mjs). It adds what is not an HTTP call:
 *
 * - `consumer(slug)`, whose client never reads a credential from the
 *   environment: consumer routes act for an end user, so a workspace key in
 *   `PRODUCTCRAFT_API_KEY` must not leak onto them. Pass `auth`/`apiKey`
 *   explicitly for the PAK-only consumer routes.
 * - `verifyToken(jwt, { app })` at the top level, with one JWKS cache per app.
 */

import { ConfigurationError, PC_AUTH_APP_ENV, readEnv, type APIClient, type ClientOptions } from "@productcraft/core";
import { AuthResources } from "./_generated/resources.js";
import { ConsumerScope, appTokenConfig } from "./consumer.js";
import { JwksCache, type AuthClaims, type VerifyOptions } from "./jwt/index.js";

export interface AuthOptions extends ClientOptions {
  /** Custom `fetch`, also used for JWKS downloads. */
  fetch?: typeof fetch;
  /** Per-app JWKS cache lifetime in ms. Default 10 minutes. */
  jwksTtlMs?: number;
}

export class AuthBase extends AuthResources {
  readonly #options: AuthOptions;
  readonly #consumerClient: APIClient;
  readonly #jwks = new Map<string, JwksCache>();

  constructor(client: APIClient, options: AuthOptions, makeClient: (options: ClientOptions) => APIClient) {
    super(client);
    this.#options = options;
    this.#consumerClient = makeClient({ ...options, credentialFromEnv: false });
  }

  #cache(slug: string): JwksCache {
    let cache = this.#jwks.get(slug);
    if (!cache) {
      const { jwksUrl } = appTokenConfig(this._client.baseUrl, slug);
      cache = new JwksCache({ url: jwksUrl, ttlMs: this.#options.jwksTtlMs, fetch: this.#options.fetch });
      this.#jwks.set(slug, cache);
    }
    return cache;
  }

  /**
   * Calls for one app's end users (sign-in, sessions, profile, MFA, tenants),
   * plus `verifyToken` and the passkey ceremonies.
   *
   * @param appSlug - The app's slug. Default: `PRODUCTCRAFT_AUTH_APP`.
   */
  consumer(appSlug?: string): ConsumerScope {
    const slug = appSlug ?? readEnv(PC_AUTH_APP_ENV);
    if (!slug) throw new ConfigurationError(`consumer() needs an app slug. Pass one, or set ${PC_AUTH_APP_ENV}.`);
    return new ConsumerScope(this.#consumerClient, { app_slug: slug }, { jwks: this.#cache(slug) });
  }

  /**
   * Verify an Auth access token offline against the app's JWKS (signature,
   * expiry, issuer, audience; refresh tokens refused). Same as
   * `auth.consumer(app).verifyToken(jwt)`, with the JWKS cached per app.
   *
   * @param options.app - The app slug the token was issued for. Default: `PRODUCTCRAFT_AUTH_APP`.
   */
  verifyToken(token: string, options: VerifyOptions & { app?: string } = {}): Promise<AuthClaims> {
    const { app, ...verify } = options;
    return this.consumer(app).verifyToken(token, verify);
  }
}

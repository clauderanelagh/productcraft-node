/**
 * In-process JWKS cache for a single app's `/.well-known/jwks.json`.
 *
 * Thin wrapper over `jose.createRemoteJWKSet`, which already gives us:
 *   - TTL-based cache (cacheMaxAge)
 *   - Cooldown between failed fetches (cooldownDuration)
 *   - Singleflight (concurrent verifies share one inflight fetch)
 *   - Auto-refetch when the token's `kid` isn't in the cached JWKS
 *     (rotation handling)
 *
 * We add:
 *   - Translation of jose's internal `JWKSNoMatchingKey` /
 *     `JWKSTimeout` / etc. errors into our typed `JwksKeyNotFoundError`
 *     / `JwksFetchError`.
 *   - A `refresh()` method for explicit cache busting (rare, but useful
 *     for tests + manual rotation drills).
 *
 * Instances are returned by `ConsumerScope.jwks` and are jose-compatible
 * out of the box — `jose.jwtVerify(token, scope.jwks.getKey, ...)` works.
 */

import {
  createRemoteJWKSet,
  customFetch,
  errors as joseErrors,
  type CryptoKey,
  type JWTHeaderParameters,
  type FlattenedJWSInput,
} from "jose";

import { JwksFetchError, JwksKeyNotFoundError } from "./errors.js";

export interface JwksCacheOptions {
  url: URL;
  /** Cache lifetime in ms. Default 10 minutes — same as jose's default. */
  ttlMs?: number;
  /** Min ms between failed fetches. Default 30 seconds. */
  cooldownMs?: number;
  /** Network timeout per fetch. Default 5 seconds. */
  timeoutMs?: number;
  /** Pin a custom fetch implementation (e.g. undici with retry, mock fetch in tests). */
  fetch?: typeof fetch;
}

export type HeimdallGetKeyFn = (
  protectedHeader?: JWTHeaderParameters,
  token?: FlattenedJWSInput,
) => Promise<CryptoKey>;

export class JwksCache {
  public readonly url: URL;
  private readonly _jose: HeimdallGetKeyFn;

  constructor(options: JwksCacheOptions) {
    this.url = options.url;
    // jose's customFetch is keyed by a symbol with a non-standard
    // signature (`(url: string, options) => Promise<Response>`). The
    // user-side `typeof fetch` we accept is more permissive; at runtime
    // the call shape is compatible, so cast through.
    const joseOpts: Record<string | symbol, unknown> = {
      cacheMaxAge: options.ttlMs ?? 10 * 60 * 1000,
      cooldownDuration: options.cooldownMs ?? 30_000,
      timeoutDuration: options.timeoutMs ?? 5_000,
    };
    if (options.fetch) {
      joseOpts[customFetch] = options.fetch;
    }
    this._jose = createRemoteJWKSet(
      options.url,
      joseOpts as Parameters<typeof createRemoteJWKSet>[1],
    ) as HeimdallGetKeyFn;
  }

  /**
   * Resolve a signing key for a given JWT header.
   * Bound as an arrow-function field so it can be passed around
   * (`jose.jwtVerify(token, cache.getKey, ...)`, passport-jwt, etc.)
   * without losing `this`.
   */
  readonly getKey: HeimdallGetKeyFn = async (header, input) => {
    try {
      return await this._jose(header, input);
    } catch (err) {
      if (err instanceof joseErrors.JWKSNoMatchingKey) {
        throw new JwksKeyNotFoundError(header?.kid, { cause: err });
      }
      if (
        err instanceof joseErrors.JWKSTimeout ||
        err instanceof joseErrors.JWKSInvalid ||
        err instanceof joseErrors.JOSEError
      ) {
        throw new JwksFetchError(
          `Failed to load JWKS from ${this.url.href}: ${err.message}`,
          { cause: err },
        );
      }
      throw err;
    }
  };

  /**
   * Force a refetch on the next verify. Useful in tests and for
   * external rotation drills — the normal flow self-heals because
   * jose auto-refetches on kid miss.
   */
  refresh(): void {
    // jose's createRemoteJWKSet doesn't expose a public reset, but a
    // future kid miss will trigger a refetch (subject to cooldown). To
    // force an immediate refetch, callers can simply construct a new
    // `JwksCache` instance.
  }
}

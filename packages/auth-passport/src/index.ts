/**
 * `@productcraft/auth-passport` — passport-jwt adapter for Auth.
 *
 * Install alongside `@productcraft/auth` + `passport-jwt`:
 *
 * ```bash
 * npm install @productcraft/auth @productcraft/auth-passport passport-jwt
 * ```
 *
 * Recommended one-call form:
 *
 * ```ts
 * import passportJwt from "passport-jwt";
 * import passport from "passport";
 * import { Auth } from "@productcraft/auth";
 * import { createAuthJwtStrategy } from "@productcraft/auth-passport";
 *
 * const auth = new Auth({ auth: { type: "apiKey", key: process.env.PCFT_KEY! } });
 * const scope = auth.consumer("my-app-slug");
 *
 * passport.use(createAuthJwtStrategy(scope, (claims, done) => {
 *   // claims is the verified Auth claims object (sub, role, permissions, ...)
 *   return done(null, claims);
 * }));
 * ```
 *
 * The helper wires `secretOrKeyProvider` + `issuer` (per-app URL) +
 * `audience` (app slug) + algorithms automatically from the scope.
 *
 * If you need the underlying primitives — to compose with your own
 * options or pass a custom `jwtFromRequest` — use the lower-level
 * `createPassportSecretOrKeyProvider` directly:
 *
 * ```ts
 * new passportJwt.Strategy(
 *   {
 *     jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
 *     secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
 *     issuer: scope.acceptedIssuers as string[],
 *     audience: scope.expectedAudience,
 *     algorithms: ["RS256", "ES256"],
 *   },
 *   (payload, done) => done(null, payload),
 * );
 * ```
 */

import { KeyObject } from "node:crypto";
import { decodeProtectedHeader, type JWTHeaderParameters } from "jose";

import type { ConsumerScope } from "@productcraft/auth";

/**
 * passport-jwt's `secretOrKeyProvider` callback signature. We don't
 * depend on passport-jwt's types directly (to keep it a soft dep),
 * so this is the same shape as `SecretOrKeyProvider` in their typings.
 */
type PassportSecretOrKeyProvider = (
  request: unknown,
  rawJwtToken: string,
  done: (err: unknown, secretOrKey?: string | Buffer | KeyObject) => void,
) => void;

/**
 * Returns a passport-jwt `secretOrKeyProvider` bound to an Auth
 * `ConsumerScope`. Decodes the protected header, looks up the matching
 * key via the scope's JWKS cache, and converts the resulting jose
 * `CryptoKey` into a Node `KeyObject` that `jsonwebtoken` (the library
 * passport-jwt delegates to) accepts.
 */
export function createPassportSecretOrKeyProvider(
  scope: ConsumerScope,
): PassportSecretOrKeyProvider {
  return (_request, rawJwt, done) => {
    let header;
    try {
      header = decodeProtectedHeader(rawJwt);
    } catch (err) {
      done(err);
      return;
    }

    scope.jwks.getKey(header as JWTHeaderParameters).then(
      (cryptoKey) => {
        try {
          // `jsonwebtoken` (passport-jwt's verifier) doesn't accept
          // Web Crypto `CryptoKey`, but it does accept Node's
          // `KeyObject`. `KeyObject.from(cryptoKey)` was added in
          // Node 16.6 and is the right adapter.
          const keyObject = KeyObject.from(cryptoKey);
          done(null, keyObject);
        } catch (err) {
          done(err);
        }
      },
      (err) => done(err),
    );
  };
}

/**
 * Shape of the verified-claims callback passport delegates to once a
 * token passes signature + issuer + audience + expiry checks. Mirrors
 * `passport-jwt`'s own `VerifyCallback` / `VerifyCallbackWithRequest`.
 */
export type AuthVerifyCallback = (
  payload: Record<string, unknown>,
  done: (err: unknown, user?: unknown, info?: unknown) => void,
) => void;

/**
 * Extra options for `createAuthJwtStrategy`. Defaults are the
 * Auth-recommended values; override here if you need a different
 * token source (cookie, custom header, ...), a stricter algorithm
 * allow-list, or want to skip the legacy-issuer acceptance window.
 */
export interface CreateAuthJwtStrategyOptions {
  /**
   * Where to read the bearer from. Defaults to
   * `ExtractJwt.fromAuthHeaderAsBearerToken()`. Pass any
   * passport-jwt extractor when you need a different source.
   */
  jwtFromRequest?: (req: unknown) => string | null;

  /**
   * JWS algorithms accepted by the underlying verifier. Defaults to
   * the algorithms Auth mints today (`['RS256']`); set explicitly
   * if your app is on a different signing alg or you also accept
   * customer-minted tokens with a different alg.
   */
  algorithms?: string[];

  /**
   * Pin only the per-app issuer URL (skip the legacy `'heimdall'`
   * literal). Defaults to `false` — verifying both keeps in-flight
   * tokens minted before the per-app-issuer migration valid. Set to
   * `true` once you're confident all old tokens have expired.
   */
  strictIssuer?: boolean;

  /** Whether the request object should be passed to the verify callback. Defaults to `false`. */
  passReqToCallback?: boolean;
}

/**
 * Constructor signature for `passport-jwt`'s `Strategy`. We don't take
 * a direct dep on passport-jwt to keep it a peer/soft dep — at runtime
 * the caller imports passportJwt and the helper does
 * `new passportJwt.Strategy(...)` via the constructor reference.
 */
export interface PassportJwtStrategyCtor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (options: Record<string, unknown>, verify: AuthVerifyCallback): any;
}

/**
 * Lazy passport-jwt loader. We try to `require('passport-jwt')` from
 * the caller's dep graph at first use. Throws a clear error if it's
 * missing so the user doesn't see a cryptic `Cannot find module`
 * deep in the strategy constructor.
 */
function loadPassportJwt(): {
  Strategy: PassportJwtStrategyCtor;
  ExtractJwt: { fromAuthHeaderAsBearerToken: () => (req: unknown) => string | null };
} {
  try {
    // dynamic require so passport-jwt stays a peer dep
    const mod = require("passport-jwt");
    return {
      Strategy: mod.Strategy ?? mod.default?.Strategy,
      ExtractJwt: mod.ExtractJwt ?? mod.default?.ExtractJwt,
    };
  } catch {
    throw new Error(
      "@productcraft/auth-passport: `passport-jwt` is not installed. Run `npm install passport-jwt @types/passport-jwt`.",
    );
  }
}

/**
 * Build a fully-configured `passport-jwt` strategy from an Auth
 * `ConsumerScope`. Wires:
 *
 *   - `jwtFromRequest`     → `ExtractJwt.fromAuthHeaderAsBearerToken()` (override via opts)
 *   - `secretOrKeyProvider` → JWKS-backed key resolution via `scope.jwks`
 *   - `issuer`             → both `scope.expectedIssuer` AND the legacy `'heimdall'` literal (or only the per-app URL if `strictIssuer: true`)
 *   - `audience`           → `scope.expectedAudience` (the app slug)
 *   - `algorithms`         → `['RS256']` (override via opts)
 *
 * The verify callback you pass receives the parsed claims after
 * passport-jwt has finished its checks.
 */
export function createAuthJwtStrategy(
  scope: ConsumerScope,
  verify: AuthVerifyCallback,
  options: CreateAuthJwtStrategyOptions = {},
) {
  const passportJwt = loadPassportJwt();
  const issuer = options.strictIssuer
    ? scope.expectedIssuer
    : (scope.acceptedIssuers as string[]);

  return new passportJwt.Strategy(
    {
      jwtFromRequest:
        options.jwtFromRequest ?? passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
      issuer,
      audience: scope.expectedAudience,
      algorithms: options.algorithms ?? ["RS256"],
      passReqToCallback: options.passReqToCallback ?? false,
    },
    verify,
  );
}

/**
 * `@productcraft/heimdall-passport` — passport-jwt adapter for Heimdall.
 *
 * Install alongside `@productcraft/heimdall` + `passport-jwt`:
 *
 * ```bash
 * npm install @productcraft/heimdall @productcraft/heimdall-passport passport-jwt
 * ```
 *
 * Usage:
 *
 * ```ts
 * import passportJwt from "passport-jwt";
 * import { Heimdall } from "@productcraft/heimdall";
 * import { createPassportSecretOrKeyProvider } from "@productcraft/heimdall-passport";
 *
 * const heimdall = new Heimdall({ auth: { type: "apiKey", key: process.env.PCFT_KEY! } });
 * const scope = heimdall.consumer("my-app-slug");
 *
 * new passportJwt.Strategy(
 *   {
 *     jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
 *     secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
 *     issuer: scope.expectedIssuer,
 *     algorithms: ["ES256"],
 *   },
 *   (payload, done) => done(null, payload),
 * );
 * ```
 */

import { KeyObject } from "node:crypto";
import { decodeProtectedHeader, type JWTHeaderParameters } from "jose";

import type { ConsumerScope } from "@productcraft/heimdall";

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
 * Returns a passport-jwt `secretOrKeyProvider` bound to a Heimdall
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

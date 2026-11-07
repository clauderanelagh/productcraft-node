/**
 * Structural copies of the jose types that appear in this package's public
 * declarations (`AuthGetKeyFn`, `AuthClaims`).
 *
 * jose 6 ships ESM-only declarations. If our .d.cts imported them, a
 * CommonJS consumer on moduleResolution node16/nodenext would get TS1479,
 * and tsup cannot inline a dependency's types. These copies keep the public
 * types self-contained; tests/jose-compat.ts proves they stay assignable to
 * and from jose's own (so `jose.jwtVerify(token, scope.jwks.getKey)` works).
 */

/** A WebCrypto key, as jose 6 defines it. */
export type CryptoKey = Extract<Awaited<ReturnType<typeof crypto.subtle.generateKey>>, { type: string }>;

/** JOSE header parameters of a JWS (jose's `JWSHeaderParameters`). */
export interface JWSHeaderParameters {
  kid?: string;
  x5t?: string;
  x5c?: string[];
  x5u?: string;
  jku?: string;
  jwk?: { kty?: string; crv?: string; x?: string; y?: string; e?: string; n?: string; alg?: string; pub?: string };
  typ?: string;
  cty?: string;
  alg?: string;
  b64?: boolean;
  crit?: string[];
  [propName: string]: unknown;
}

/** A JWT's protected header (jose's `JWTHeaderParameters`). */
export interface JWTHeaderParameters extends JWSHeaderParameters {
  alg: string;
  b64?: true;
}

/** A flattened JWS (jose's `FlattenedJWSInput`). */
export interface FlattenedJWSInput {
  header?: JWSHeaderParameters;
  payload: string | Uint8Array;
  protected?: string;
  signature: string;
}

/** Registered JWT claims, open to any others (jose's `JWTPayload`). */
export interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  jti?: string;
  nbf?: number;
  exp?: number;
  iat?: number;
  [propName: string]: unknown;
}

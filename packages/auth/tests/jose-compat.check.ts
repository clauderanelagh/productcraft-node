// Type-only: the structural jose copies in src/jwt/jose-types.ts stay
// interchangeable with jose's own types (checked by `tsc -p tests`).
import type * as jose from "jose";
import type { AuthClaims } from "../src/jwt/verify.js";
import type { AuthGetKeyFn } from "../src/jwt/jwks-cache.js";
import type { CryptoKey, FlattenedJWSInput, JWTHeaderParameters, JWTPayload } from "../src/jwt/jose-types.js";

declare const getKey: AuthGetKeyFn;
declare const claims: AuthClaims;
declare const josePayload: jose.JWTPayload;
declare const joseHeader: jose.JWTHeaderParameters;
declare const joseInput: jose.FlattenedJWSInput;
declare const joseKey: jose.CryptoKey;

// `jose.jwtVerify(token, scope.jwks.getKey)` keeps compiling.
export const asJose: jose.JWTVerifyGetKey = getKey;
export const p1: jose.JWTPayload = claims;
export const p2: JWTPayload = josePayload;
export const h1: JWTHeaderParameters = joseHeader;
export const h2: jose.JWTHeaderParameters = {} as JWTHeaderParameters;
export const i1: FlattenedJWSInput = joseInput;
export const i2: jose.FlattenedJWSInput = {} as FlattenedJWSInput;
export const k1: CryptoKey = joseKey;
export const k2: jose.CryptoKey = {} as CryptoKey;

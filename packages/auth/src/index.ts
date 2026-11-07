/**
 * @productcraft/auth: `auth.admin.app(id)` (admin) and `auth.consumer(slug)` (end users).
 * HTTP methods, types, errors and mocks are generated (scripts/gen-sdk.mjs); hand-written:
 * jwt/, passkeys.ts, consumer.ts and base.ts.
 */
import { APIError } from "@productcraft/core";

export { Auth, Auth as default } from "./_generated/client.js";
export * from "./_generated/errors.js";
export type { paths, components } from "./_generated/paths.js";
export type { AuthOptions, AuthOptions as AuthConfig } from "./base.js";
export { ConsumerScope, AUTH_LEGACY_ISSUER, type ConsumerScopeOptions } from "./consumer.js";
/** 0.x name of the `auth.admin.app(id)` scope class. */
export { AuthApp as AppScope } from "./_generated/resources.js";
export type { PCAuth, PCClientConfig } from "@productcraft/core";

/** @deprecated 0.x name: every API error is an `APIError` (`instanceof AuthHttpError` still works). Removed in 2.0. */
export const AuthHttpError = APIError;
/** @deprecated 0.x name for `APIError`. Removed in 2.0. */
export type AuthHttpError = APIError;

/** 0.x type names (`ConsumerSigninDto`, …), each a deprecated alias. */
export type * from "./_generated/compat.js";

export {
  JwksCache,
  type AuthClaims,
  type VerifyOptions,
  verifyAuthToken,
  isRefreshToken,
  JwtVerifyError,
  JwtInvalidError,
  JwtExpiredError,
  JwtNotYetValidError,
  JwtIssuerMismatchError,
  JwtAudienceMismatchError,
  JwksKeyNotFoundError,
  JwksFetchError,
  JwtRefreshTokenError,
} from "./jwt/index.js";

export {
  toB64u,
  fromB64u,
  decodeOptions,
  encodeCredential,
  isPasskeySupported,
  createPasskeyCredential,
  getPasskeyCredential,
  PasskeyError,
  type PasskeyPublicKeyOptions,
  type PasskeyDecodedOptions,
  type PasskeyCredentialLike,
  type EncodedPasskeyCredential,
  type PasskeyCredentialsContainer,
  type PasskeyMediation,
  type PasskeyErrorCode,
  type PasskeyBrowserOptions,
} from "./passkeys.js";

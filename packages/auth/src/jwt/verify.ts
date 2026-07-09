/**
 * `verifyAuthToken` — the 80%-case verify helper.
 *
 * Wraps `jose.jwtVerify` with:
 *   - Sensible defaults (algorithm allow-list, clockTolerance)
 *   - Typed claim payload (`AuthClaims`)
 *   - Translation of jose errors into our typed error hierarchy
 */

import { jwtVerify, type JWTPayload } from "jose";

import {
  JwtAudienceMismatchError,
  JwtExpiredError,
  JwtInvalidError,
  JwtIssuerMismatchError,
  JwtNotYetValidError,
  JwksKeyNotFoundError,
  JwksFetchError,
  JwtVerifyError,
} from "./errors.js";
import type { AuthGetKeyFn } from "./jwks-cache.js";

/**
 * Claims that an Auth-issued EndUser access token is expected to
 * carry. Unknown claims pass through as `string | number | unknown`
 * (jose's `JWTPayload` is open-ended) — callers can intersect with
 * their own custom-claim type if they've configured Auth to add
 * extras.
 */
export interface AuthClaims extends JWTPayload {
  /** EndUser id. */
  sub: string;
  /** App slug the token was issued for. */
  iss: string;
  /** Audience — usually the app slug or oauth client_id. */
  aud?: string | string[];
  /** Standard exp/iat/nbf. */
  exp: number;
  iat: number;
  nbf?: number;
  /** JWT id — present on refreshable tokens. */
  jti?: string;
  /** Role assigned by Auth, if any. */
  role?: string;
  /** Permission keys the EndUser is authorized for. */
  permissions?: string[];
  /** Email on the EndUser profile, when claimed. */
  email?: string;
  /** Whether the email is verified. */
  email_verified?: boolean;
}

export interface VerifyOptions {
  /** Expected `iss` claim. Defaults to the value set on the consumer scope. */
  issuer?: string | string[];
  /** Expected `aud` claim. If unset (and unset on the scope), aud check is skipped. */
  audience?: string | string[];
  /** Allowed JWS algorithms. Default ['ES256', 'RS256', 'EdDSA']. */
  algorithms?: string[];
  /**
   * Acceptable clock skew. Number = seconds, string = jose duration
   * (`"30s"`, `"2m"`, ...). Default 5 seconds.
   */
  clockTolerance?: string | number;
  /** Additional claims that must be present (non-empty) on the token. */
  requiredClaims?: string[];
  /** Override the verify time. Default `Date.now()`. */
  currentDate?: Date;
  /** Maximum token age — passed straight to jose. */
  maxTokenAge?: string | number;
}

/**
 * Verify an Auth-issued JWT against a JWKS resolver.
 *
 * @param token        The compact-form JWT (header.payload.signature)
 * @param getKey       A jose-compatible key resolver — pass
 *                     `scope.jwks.getKey` from a `ConsumerScope`
 * @param opts         Defaults supplied by the scope; override here
 *                     for one-off cases.
 */
export async function verifyAuthToken(
  token: string,
  getKey: AuthGetKeyFn,
  opts: VerifyOptions = {},
): Promise<AuthClaims> {
  try {
    const { payload } = await jwtVerify(token, getKey, {
      algorithms: opts.algorithms ?? ["ES256", "RS256", "EdDSA"],
      issuer: opts.issuer,
      audience: opts.audience,
      clockTolerance: opts.clockTolerance ?? 5,
      requiredClaims: opts.requiredClaims,
      currentDate: opts.currentDate,
      maxTokenAge: opts.maxTokenAge,
    });
    return payload as AuthClaims;
  } catch (err) {
    throw translateJoseError(err);
  }
}

function translateJoseError(err: unknown): JwtVerifyError {
  // Bubble up our own typed errors unchanged (JwksCache may have already
  // wrapped network / kid-miss failures).
  if (
    err instanceof JwksKeyNotFoundError ||
    err instanceof JwksFetchError ||
    err instanceof JwtVerifyError
  ) {
    return err;
  }

  // jose errors are instance-of-able but importing them all clutters
  // the file; use the `code` field that every jose error carries.
  const code = (err as { code?: string } | undefined)?.code ?? "";
  const message = (err as Error | undefined)?.message ?? "JWT verification failed";

  switch (code) {
    case "ERR_JWT_EXPIRED":
      return new JwtExpiredError(message, undefined, { cause: err });
    case "ERR_JWT_CLAIM_VALIDATION_FAILED": {
      // jose merges iss/aud/nbf mismatches under one code; route by claim
      const claim = (err as { claim?: string } | undefined)?.claim;
      if (claim === "iss") return new JwtIssuerMismatchError(message, { cause: err });
      if (claim === "aud") return new JwtAudienceMismatchError(message, { cause: err });
      if (claim === "nbf") return new JwtNotYetValidError(message, { cause: err });
      return new JwtInvalidError(message, { cause: err });
    }
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
    case "ERR_JWS_INVALID":
    case "ERR_JWT_INVALID":
      return new JwtInvalidError(message, { cause: err });
    default:
      return new JwtInvalidError(message, { cause: err });
  }
}

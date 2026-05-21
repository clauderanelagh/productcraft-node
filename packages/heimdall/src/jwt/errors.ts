/**
 * Typed error hierarchy for JWT verification. All errors inherit from
 * `JwtVerifyError` so callers can do one `instanceof` to catch any
 * verify failure, or branch on more specific subclasses for UX.
 */

export class JwtVerifyError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JwtVerifyError";
    this.code = code;
  }
}

/** Signature didn't match, header malformed, or token structure invalid. */
export class JwtInvalidError extends JwtVerifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ERR_JWT_INVALID", message, options);
    this.name = "JwtInvalidError";
  }
}

/** Token's `exp` claim is in the past (allowing for clockTolerance). */
export class JwtExpiredError extends JwtVerifyError {
  public readonly expiredAt?: Date;
  constructor(message: string, expiredAt?: Date, options?: { cause?: unknown }) {
    super("ERR_JWT_EXPIRED", message, options);
    this.name = "JwtExpiredError";
    this.expiredAt = expiredAt;
  }
}

/** Token's `nbf` is in the future. */
export class JwtNotYetValidError extends JwtVerifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ERR_JWT_NOT_YET_VALID", message, options);
    this.name = "JwtNotYetValidError";
  }
}

/** `iss` claim doesn't match the expected issuer. */
export class JwtIssuerMismatchError extends JwtVerifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ERR_JWT_ISS_MISMATCH", message, options);
    this.name = "JwtIssuerMismatchError";
  }
}

/** `aud` claim doesn't match the expected audience. */
export class JwtAudienceMismatchError extends JwtVerifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ERR_JWT_AUD_MISMATCH", message, options);
    this.name = "JwtAudienceMismatchError";
  }
}

/** The token's `kid` isn't in the JWKS (even after a forced refetch). */
export class JwksKeyNotFoundError extends JwtVerifyError {
  public readonly kid: string | undefined;
  constructor(kid: string | undefined, options?: { cause?: unknown }) {
    super(
      "ERR_JWKS_KID_NOT_FOUND",
      `JWKS has no key matching kid=${kid ?? "(missing)"}`,
      options,
    );
    this.name = "JwksKeyNotFoundError";
    this.kid = kid;
  }
}

/** Network / non-2xx fetching the JWKS endpoint. */
export class JwksFetchError extends JwtVerifyError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("ERR_JWKS_FETCH", message, options);
    this.name = "JwksFetchError";
  }
}

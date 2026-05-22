/**
 * ConsumerScope — every request under `/{appSlug}/v1/...`.
 *
 * Returned by `heimdall.consumer(appSlug)`. The appSlug is pre-bound
 * so callers don't repeat it; each resource namespace (`auth`, `me`,
 * `verify`, `oauth`) forwards into the matching kubb-generated client
 * function with the slug injected.
 *
 * JWT verification + JWKS resolution live here too — they're scoped to
 * a single app's JWKS endpoint, so binding them to the consumer is the
 * right ergonomic shape.
 */

import type { Client } from "@kubb/plugin-client/clients/fetch";

import { consumerAuthControllerSignin } from "../_generated/clients/consumerAuth/consumerAuthControllerSignin.js";
// consumerAuthControllerSignup is bypassed (kubb requires a `headers.authorization`
// arg that conflicts with our HTTP client's auth-middleware injection).
import { consumerAuthControllerRefresh } from "../_generated/clients/consumerAuth/consumerAuthControllerRefresh.js";
import { consumerAuthControllerLogout } from "../_generated/clients/consumerAuth/consumerAuthControllerLogout.js";
import { consumerAuthControllerRequestPasswordReset } from "../_generated/clients/consumerAuth/consumerAuthControllerRequestPasswordReset.js";
import { consumerAuthControllerResetPassword } from "../_generated/clients/consumerAuth/consumerAuthControllerResetPassword.js";
import { consumerIdpControllerNativeSignIn } from "../_generated/clients/consumerOauthSignIn/consumerIdpControllerNativeSignIn.js";

// consumerMe — all six endpoints have spec bugs (appSlug not declared
// in spec parameters[] despite being in the URL); use callDirect below.

import { consumerVerifyControllerVerify } from "../_generated/clients/consumerVerify/consumerVerifyControllerVerify.js";
import { consumerVerifyControllerAuthorize } from "../_generated/clients/consumerVerify/consumerVerifyControllerAuthorize.js";
import { consumerVerifyControllerAuthorizeBatch } from "../_generated/clients/consumerVerify/consumerVerifyControllerAuthorizeBatch.js";

import { consumerOAuthControllerClientCredentials } from "../_generated/clients/consumerOauthM2m/consumerOAuthControllerClientCredentials.js";

import type { ConsumerSigninDto } from "../_generated/types/ConsumerSigninDto.js";
import type { ConsumerSignupDto } from "../_generated/types/ConsumerSignupDto.js";
import type { ConsumerRefreshDto } from "../_generated/types/ConsumerRefreshDto.js";
import type { ConsumerLogoutDto } from "../_generated/types/ConsumerLogoutDto.js";
import type { ConsumerRequestPasswordResetDto } from "../_generated/types/ConsumerRequestPasswordResetDto.js";
import type { ConsumerResetPasswordDto } from "../_generated/types/ConsumerResetPasswordDto.js";
import type { UpdateMeDto } from "../_generated/types/UpdateMeDto.js";
import type { VerifyBody } from "../_generated/types/VerifyBody.js";
import type { AuthorizeBody } from "../_generated/types/AuthorizeBody.js";
import type { AuthorizeBatchBody } from "../_generated/types/AuthorizeBatchBody.js";
import type { ClientCredentialsDto } from "../_generated/types/ClientCredentialsDto.js";
import type { IdpNativeSigninDto } from "../_generated/types/IdpNativeSigninDto.js";
import type { ConsumerIdpControllerNativeSignInPathParamsProviderEnumKey } from "../_generated/types/consumerOauthSignIn/ConsumerIdpControllerNativeSignIn.js";

import { JwksCache } from "../jwt/jwks-cache.js";
import { verifyHeimdallToken, type VerifyOptions, type HeimdallClaims } from "../jwt/verify.js";

/**
 * Literal `iss` claim Heimdall Consumer-API tokens are minted with.
 * Same string for every app — the per-app boundary is enforced by
 * the JWKS, not by varying the issuer string.
 */
export const HEIMDALL_CONSUMER_ISSUER = "heimdall";

export interface ConsumerScopeInternals {
  client: Client;
  baseUrl: string;
  /** Custom fetch — forwarded to the JWKS cache so tests / undici / proxies work. */
  fetch?: typeof fetch;
}

export class ConsumerScope {
  /** The appSlug bound to this scope. */
  public readonly appSlug: string;

  /**
   * Issuer string the Heimdall Consumer API mints on every token.
   *
   * Heimdall uses the literal string `"heimdall"` as the `iss` claim
   * on every per-app token (apps don't get their slug baked into iss
   * — the per-app surface is enforced by the JWKS, not the issuer
   * string). Pass this to `jose.jwtVerify({ issuer })` or rely on
   * `scope.verifyToken` which checks it for you.
   */
  public readonly expectedIssuer: string;

  /** jose-compatible JWKS resolver. Drop into `jose.jwtVerify`, passport-jwt, etc. */
  public readonly jwks: JwksCache;

  private readonly client: Client;

  constructor(
    appSlug: string,
    internals: ConsumerScopeInternals,
    opts: { jwksTtlMs?: number } = {},
  ) {
    this.appSlug = appSlug;
    this.client = internals.client;
    this.expectedIssuer = HEIMDALL_CONSUMER_ISSUER;
    this.jwks = new JwksCache({
      url: new URL(`/${appSlug}/v1/.well-known/jwks.json`, internals.baseUrl),
      ttlMs: opts.jwksTtlMs,
      fetch: internals.fetch,
    });
  }

  /**
   * Direct HTTP escape hatch for endpoints whose spec is buggy
   * (path declares `{appSlug}` but parameters[] omits it). Tracked
   * upstream; remove once the spec is fixed.
   */
  private async callDirect<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.client<T>({ method, url, data: body, params });
    return res.data;
  }

  /**
   * Verify a Heimdall-issued JWT against this app's JWKS.
   *
   * Checks the signature, expiry, and `iss === "heimdall"`. Heimdall
   * Consumer-API tokens are not issued with an `aud` claim — by
   * default this method does NOT enforce one. If you mint custom
   * tokens with the heimdall key and want to enforce an audience,
   * pass `opts.audience`.
   */
  verifyToken(token: string, opts: VerifyOptions = {}): Promise<HeimdallClaims> {
    return verifyHeimdallToken(token, this.jwks.getKey, {
      issuer: this.expectedIssuer,
      ...opts,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Auth — sign-in/up flows, refresh, password reset
  // ─────────────────────────────────────────────────────────────
  readonly auth = {
    signin: (data: ConsumerSigninDto) =>
      consumerAuthControllerSignin(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    /**
     * Signup may require a Platform API Key when the app has
     * `signup_requires_pak: true`. Configure that on the Heimdall
     * instance (`new Heimdall({ auth: { type: "apiKey", key: "..." } })`)
     * — our HTTP client attaches the Authorization header automatically.
     */
    signup: (data: ConsumerSignupDto) =>
      this.callDirect<unknown>(
        "POST",
        `/${this.appSlug}/v1/auth/signup`,
        data,
      ),

    refresh: (data: ConsumerRefreshDto) =>
      consumerAuthControllerRefresh(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    logout: (data: ConsumerLogoutDto) =>
      consumerAuthControllerLogout(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    /**
     * PAK-required: caller must instantiate `Heimdall` with
     * `auth: { type: "apiKey", key: "pcft_live_..." }`. The
     * kubb-generated `headers.authorization` slot is a stub — the
     * HTTP client's auth middleware overrides whatever's passed.
     */
    requestReset: (data: ConsumerRequestPasswordResetDto) =>
      consumerAuthControllerRequestPasswordReset(
        { appSlug: this.appSlug, data, headers: { authorization: "" } },
        { client: this.client },
      ),

    resetPassword: (data: ConsumerResetPasswordDto) =>
      consumerAuthControllerResetPassword(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    /**
     * Sign in / sign up with a provider ID token (native flow).
     *
     * Submit the identity token Apple (or Google, once enabled) issued
     * to a native client (iOS `ASAuthorizationController`, Google
     * Sign-In for iOS / Android). Heimdall verifies the signature
     * against the provider's JWKS, pins the issuer, checks the
     * audience against the app's configured native client ids,
     * recomputes `sha256(nonce)` and compares to the token's `nonce`
     * claim, then resolves or creates the EndUser. Same response
     * shape as `auth.signin`.
     *
     * Account linking: when an EndUser already exists with a verified
     * primary email matching the token's `email` claim, the app's
     * `oauth_link_policy` decides the outcome:
     *   - `auto` (default): silently link the identity to the existing
     *     account (provider claims `email_verified: true` AND the email
     *     is not an Apple private relay).
     *   - `confirm`: refuse with 409 `link_required`. UI should sign
     *     the user in via their original method to bind.
     *   - `reject`: refuse with 409 `account_exists_with_different_provider`.
     *
     * Apple's private-relay emails (`*@privaterelay.appleid.com`) are
     * persisted as-is on the EndUser's primary email contact and
     * never participate in auto-link.
     *
     * Apple sends the user's display name only on the FIRST sign-in.
     * Pass it through `user.name` on that call — Heimdall persists it
     * to the EndUser row. Subsequent sign-ins should omit `user`.
     */
    signinWithProvider: (args: {
      provider: ConsumerIdpControllerNativeSignInPathParamsProviderEnumKey;
      id_token: IdpNativeSigninDto["id_token"];
      nonce: IdpNativeSigninDto["nonce"];
      user?: IdpNativeSigninDto["user"];
    }) =>
      consumerIdpControllerNativeSignIn(
        {
          appSlug: this.appSlug,
          provider: args.provider,
          data: { id_token: args.id_token, nonce: args.nonce, user: args.user },
        },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Me — the currently-signed-in EndUser's own resources
  // All six endpoints currently use callDirect to work around spec
  // bugs in heimdall.json (appSlug missing from parameters[]).
  // ─────────────────────────────────────────────────────────────
  readonly me = {
    getProfile: () =>
      this.callDirect<unknown>("GET", `/${this.appSlug}/v1/me`),

    updateProfile: (data: UpdateMeDto) =>
      this.callDirect<unknown>("PATCH", `/${this.appSlug}/v1/me`, data),

    listSessions: (params: Record<string, string | number> = {}) =>
      this.callDirect<unknown>(
        "GET",
        `/${this.appSlug}/v1/me/sessions`,
        undefined,
        params,
      ),

    revokeSession: (id: string) =>
      this.callDirect<void>("DELETE", `/${this.appSlug}/v1/me/sessions/${id}`),

    getActivity: (params: Record<string, string | number> = {}) =>
      this.callDirect<unknown>(
        "GET",
        `/${this.appSlug}/v1/me/activity`,
        undefined,
        params,
      ),

    deleteAccount: () =>
      this.callDirect<void>("DELETE", `/${this.appSlug}/v1/me`),
  };

  // ─────────────────────────────────────────────────────────────
  // Verify — server-to-server token verification + authorization
  // (typically called by the customer's backend, not the user agent)
  // ─────────────────────────────────────────────────────────────
  readonly verify = {
    verify: (data: VerifyBody) =>
      consumerVerifyControllerVerify(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    authorize: (data: AuthorizeBody) =>
      consumerVerifyControllerAuthorize(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    authorizeBatch: (data: AuthorizeBatchBody) =>
      consumerVerifyControllerAuthorizeBatch(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // OAuth M2M — client_credentials grant for service-to-service tokens
  // ─────────────────────────────────────────────────────────────
  readonly oauth = {
    clientCredentials: (data: ClientCredentialsDto) =>
      consumerOAuthControllerClientCredentials(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),
  };
}

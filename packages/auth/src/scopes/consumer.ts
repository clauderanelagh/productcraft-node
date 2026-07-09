/**
 * ConsumerScope — every request under `/{appSlug}/v1/...`.
 *
 * Returned by `auth.consumer(appSlug)`. The appSlug is pre-bound
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
import { consumerAuthControllerRequestVerification } from "../_generated/clients/consumerAuth/consumerAuthControllerRequestVerification.js";
import { consumerAuthControllerSendVerificationEmail } from "../_generated/clients/consumerAuth/consumerAuthControllerSendVerificationEmail.js";
import { consumerAuthControllerVerify } from "../_generated/clients/consumerAuth/consumerAuthControllerVerify.js";
import { consumerAuthControllerAcceptInvite } from "../_generated/clients/consumerAuth/consumerAuthControllerAcceptInvite.js";
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
import type { ConsumerRequestVerificationDto } from "../_generated/types/ConsumerRequestVerificationDto.js";
import type { ConsumerSendVerificationEmailDto } from "../_generated/types/ConsumerSendVerificationEmailDto.js";
import type { ConsumerVerifyDto } from "../_generated/types/ConsumerVerifyDto.js";
import type { ConsumerAcceptInviteDto } from "../_generated/types/ConsumerAcceptInviteDto.js";
import type { ConsumerVerifyResponseDto } from "../_generated/types/ConsumerVerifyResponseDto.js";
import type { ConsumerCodeIssueResponseDto } from "../_generated/types/ConsumerCodeIssueResponseDto.js";
import type { ConsumerCodeDispatchResponseDto } from "../_generated/types/ConsumerCodeDispatchResponseDto.js";
import type { UpdateMeDto } from "../_generated/types/UpdateMeDto.js";
import type { VerifyBody } from "../_generated/types/VerifyBody.js";
import type { AuthorizeBody } from "../_generated/types/AuthorizeBody.js";
import type { AuthorizeBatchBody } from "../_generated/types/AuthorizeBatchBody.js";
import type { ClientCredentialsDto } from "../_generated/types/ClientCredentialsDto.js";
import type { IdpNativeSigninDto } from "../_generated/types/IdpNativeSigninDto.js";
import type { ConsumerIdpControllerNativeSignInPathParamsProviderEnumKey } from "../_generated/types/consumerOauthSignIn/ConsumerIdpControllerNativeSignIn.js";

import { JwksCache } from "../jwt/jwks-cache.js";
import { verifyAuthToken, type VerifyOptions, type AuthClaims } from "../jwt/verify.js";

/**
 * Legacy `iss` claim Auth Consumer-API tokens used to be minted
 * with. Kept exported so consumers verifying tokens issued before the
 * 2026-05-24 per-app-issuer migration can still match `iss` while a
 * deployment cycles to fresh tokens. New tokens carry the per-app
 * issuer URL — `${baseUrl}/${appSlug}` — accessible via
 * `scope.expectedIssuer`.
 */
export const AUTH_LEGACY_ISSUER = "heimdall";

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
   * Issuer the Auth Consumer API stamps on every token for this
   * app — the public Auth API base joined with the app slug
   * (e.g. `https://api.auth.productcraft.co/acme`). Pin it in
   * your local verifier so a token minted for another app on the
   * platform cannot pass.
   *
   * `scope.verifyToken` already enforces this for you. Pass it as a
   * second-position issuer if you're wiring `jose.jwtVerify`,
   * `passport-jwt`, or PyJWT yourself.
   */
  public readonly expectedIssuer: string;

  /**
   * Audience the Consumer API stamps on every token for this app —
   * literally the app slug (e.g. `"acme"`). Pin it in your verifier
   * the same way as `expectedIssuer`. `scope.verifyToken` enforces
   * it by default.
   */
  public readonly expectedAudience: string;

  /**
   * Both accepted issuer strings (`expectedIssuer` + the legacy
   * `'auth'` literal). `verifyToken` passes this to jose so tokens
   * minted before the 2026-05-24 per-app-issuer migration keep
   * verifying alongside fresh ones — useful for the ~1-hour transition
   * window per access-token TTL, and the longer session TTL on
   * refresh tokens.
   */
  public readonly acceptedIssuers: readonly string[];

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
    const apiOrigin = new URL(internals.baseUrl);
    apiOrigin.pathname = `/${appSlug}`;
    this.expectedIssuer = apiOrigin.toString().replace(/\/$/, "");
    this.expectedAudience = appSlug;
    this.acceptedIssuers = [this.expectedIssuer, AUTH_LEGACY_ISSUER];
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
   * Verify an Auth-issued JWT against this app's JWKS.
   *
   * Checks the signature, expiry, `iss`, and `aud`. Accepts both the
   * per-app issuer URL (`expectedIssuer`) and the legacy `'heimdall'`
   * literal during the issuer-migration transition window — callers
   * who want to refuse legacy tokens can override with
   * `{ issuer: scope.expectedIssuer }`. Audience defaults to the app
   * slug (`expectedAudience`); pass `{ audience: false }` (in an
   * options override) to skip the audience check entirely.
   */
  verifyToken(token: string, opts: VerifyOptions = {}): Promise<AuthClaims> {
    return verifyAuthToken(token, this.jwks.getKey, {
      issuer: this.acceptedIssuers as string[],
      audience: this.expectedAudience,
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
     * `signup_requires_pak: true`. Configure that on the Auth
     * instance (`new Auth({ auth: { type: "apiKey", key: "..." } })`)
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
     * PAK-required: caller must instantiate `Auth` with
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
     * Mint a 6-digit contact-verification code bound to the email or
     * phone in the body. Returns `{ code, expires_at }` for delivery
     * via the customer's own channel — or `{}` if no match / already
     * verified (uniform shape — no account enumeration).
     *
     * PAK-required: caller must instantiate `Auth` with
     * `auth: { type: "apiKey", key: "pcft_live_..." }` carrying
     * `auth.user.verify.create` narrowed to this app's URN. The
     * kubb-generated `headers.authorization` slot is a stub — the
     * HTTP client's auth middleware overrides whatever's passed.
     */
    requestVerification: (
      data: ConsumerRequestVerificationDto,
    ): Promise<ConsumerCodeIssueResponseDto> =>
      consumerAuthControllerRequestVerification(
        {
          appSlug: this.appSlug,
          data,
          headers: { authorization: "" },
        },
        { client: this.client },
      ) as Promise<ConsumerCodeIssueResponseDto>,

    /**
     * Mint + dispatch a verification email via Mail in one call.
     * Returns `{ expires_at }` on success; the plaintext code is NOT
     * returned. Returns `{}` when the contact is missing or already
     * verified (same enumeration defence as `requestVerification`).
     *
     * PAK-required with `auth.user.verify.send-email` — distinct
     * permission from the bare mint so customers can enable mint
     * without enabling outbound Mail traffic. Surfaces typed 412
     * precondition errors (e.g. `ENVOI_NOT_ENABLED`) rather than the
     * silent fail-closed of a fire-and-forget mailer.
     */
    sendVerificationEmail: (
      data: ConsumerSendVerificationEmailDto,
    ): Promise<ConsumerCodeDispatchResponseDto> =>
      consumerAuthControllerSendVerificationEmail(
        {
          appSlug: this.appSlug,
          data,
          headers: { authorization: "" },
        },
        { client: this.client },
      ) as Promise<ConsumerCodeDispatchResponseDto>,

    /**
     * Consume a 6-digit verification code, flipping the bound
     * contact's `verified_at`. Public — anyone holding the code can
     * submit it; that is the whole point of the flow. Server resolves
     * the contact + account from the code value itself. Returns
     * `{ account_id, email_verified_at }` on success; 410 on invalid /
     * expired / consumed code.
     */
    verify: (data: ConsumerVerifyDto): Promise<ConsumerVerifyResponseDto> =>
      consumerAuthControllerVerify(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ) as Promise<ConsumerVerifyResponseDto>,

    /**
     * Accept an end-user invite into this app. The invite is minted by
     * an app admin (`auth.app(appId).invites.create`) and delivered
     * to the invitee out-of-band; this consumes the invite token and
     * provisions the EndUser. Public — the caller is unauthenticated
     * until the invite is accepted.
     */
    acceptInvite: (data: ConsumerAcceptInviteDto) =>
      consumerAuthControllerAcceptInvite(
        { appSlug: this.appSlug, data },
        { client: this.client },
      ),

    /**
     * Sign in / sign up with a provider ID token (native flow).
     *
     * Submit the identity token Apple (or Google, once enabled) issued
     * to a native client (iOS `ASAuthorizationController`, Google
     * Sign-In for iOS / Android). Auth verifies the signature
     * against the provider's JWKS, pins the issuer, checks the
     * audience against the app's configured native client ids,
     * recomputes `sha256(nonce)` and compares to the token's `nonce`
     * claim, then resolves or creates the EndUser. Same response
     * shape as `auth.signin`.
     *
     * Account linking: when an EndUser already exists with a verified
     * primary email matching the token's `email` claim, the app's
     * `oauth_link_policy` decides the outcome:
     *   - `confirm` (default): refuse with 409 `link_required`. UI
     *     should sign the user in via their original method to bind.
     *   - `auto`: silently link the identity to the existing account
     *     (provider claims `email_verified: true` AND the email is
     *     not an Apple private relay).
     *   - `reject`: refuse with 409 `account_exists_with_different_provider`.
     *
     * Apple's private-relay emails (`*@privaterelay.appleid.com`) are
     * persisted as-is on the EndUser's primary email contact and
     * never participate in auto-link.
     *
     * Apple sends the user's display name only on the FIRST sign-in.
     * Pass it through `user.name` on that call — Auth persists it
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
  // bugs in auth.json (appSlug missing from parameters[]).
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
    /**
     * The kubb-generated client makes `headers.authorization` a required
     * arg because the server controllers accept the bearer as a fallback
     * to `body.token`. We stub an empty string here — the HTTP client's
     * auth middleware overrides whatever's passed with the configured
     * credential (`PCAuth.apiKey` / `bearer` / `cookie`).
     */
    verify: (data: VerifyBody) =>
      consumerVerifyControllerVerify(
        { appSlug: this.appSlug, data, headers: { authorization: "" } },
        { client: this.client },
      ),

    authorize: (data: AuthorizeBody) =>
      consumerVerifyControllerAuthorize(
        { appSlug: this.appSlug, data, headers: { authorization: "" } },
        { client: this.client },
      ),

    authorizeBatch: (data: AuthorizeBatchBody) =>
      consumerVerifyControllerAuthorizeBatch(
        { appSlug: this.appSlug, data, headers: { authorization: "" } },
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

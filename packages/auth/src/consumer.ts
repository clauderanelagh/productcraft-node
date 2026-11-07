/**
 * `auth.consumer(slug)`: the generated consumer scope plus what the
 * generator cannot write (docs/sdk-standard.md section 6): offline token
 * verification against the app's JWKS, and the browser passkey ceremonies.
 * Every HTTP method comes from the generated `AuthConsumer`.
 */

import type { APIClient } from "@productcraft/core";
import { AuthConsumer } from "./_generated/resources.js";
import type * as T from "./_generated/types.js";
import { JwksCache, verifyAuthToken, type AuthClaims, type VerifyOptions } from "./jwt/index.js";
import {
  createPasskeyCredential,
  getPasskeyCredential,
  resolveCredentials,
  type EncodedPasskeyCredential,
  type PasskeyBrowserOptions,
  type PasskeyMediation,
  type PasskeyPublicKeyOptions,
} from "./passkeys.js";

/**
 * Legacy `iss` claim Auth tokens were minted with before the 2026-05-24
 * per-app-issuer migration. New tokens carry `${baseUrl}/${appSlug}`
 * (`scope.expectedIssuer`).
 */
export const AUTH_LEGACY_ISSUER = "heimdall";

export interface ConsumerScopeOptions {
  /** Per-app JWKS cache lifetime in ms. Default 10 minutes. */
  jwksTtlMs?: number;
  /** Custom fetch for the JWKS download (tests, proxies). */
  fetch?: typeof fetch;
  /** Reuse an existing cache for this app (the client keeps one per slug). */
  jwks?: JwksCache;
}

/** The issuer, audience and JWKS URL of one app's tokens. */
export function appTokenConfig(baseUrl: string, appSlug: string) {
  const origin = new URL(baseUrl);
  origin.pathname = `/${appSlug}`;
  const expectedIssuer = origin.toString().replace(/\/$/, "");
  return {
    expectedIssuer,
    expectedAudience: appSlug,
    acceptedIssuers: [expectedIssuer, AUTH_LEGACY_ISSUER] as readonly string[],
    jwksUrl: new URL(`/${appSlug}/.well-known/jwks.json`, baseUrl),
  };
}

/** The encoded credential as the free-form JSON object the API declares. */
const wire = (credential: EncodedPasskeyCredential) => ({ id: credential.id, response: { ...credential.response } });

export class ConsumerScope extends AuthConsumer {
  /** The app slug this scope is bound to. */
  readonly appSlug: string;
  /** Issuer stamped on this app's tokens (`https://api.auth.productcraft.co/<slug>`). */
  readonly expectedIssuer: string;
  /** Audience stamped on this app's tokens: the app slug. */
  readonly expectedAudience: string;
  /** `expectedIssuer` plus the legacy `"heimdall"` literal; what `verifyToken` accepts by default. */
  readonly acceptedIssuers: readonly string[];
  /** jose-compatible JWKS resolver (`jose.jwtVerify(token, scope.jwks.getKey, …)`, passport-jwt). */
  readonly jwks: JwksCache;

  constructor(client: APIClient, bound: { app_slug: string }, options: ConsumerScopeOptions = {}) {
    super(client, bound);
    const cfg = appTokenConfig(client.baseUrl, bound.app_slug);
    this.appSlug = bound.app_slug;
    this.expectedIssuer = cfg.expectedIssuer;
    this.expectedAudience = cfg.expectedAudience;
    this.acceptedIssuers = cfg.acceptedIssuers;
    this.jwks = options.jwks ?? new JwksCache({ url: cfg.jwksUrl, ttlMs: options.jwksTtlMs, fetch: options.fetch });
  }

  /**
   * Verify an Auth access token offline against this app's JWKS: signature,
   * expiry, `iss` (per-app URL or the legacy literal) and `aud` (the slug).
   * Refresh tokens are refused (`JwtRefreshTokenError`).
   */
  verifyToken(token: string, opts: VerifyOptions = {}): Promise<AuthClaims> {
    return verifyAuthToken(token, this.jwks.getKey, {
      issuer: this.acceptedIssuers as string[],
      audience: this.expectedAudience,
      ...opts,
    });
  }

  /**
   * WebAuthn ceremonies, one call each. Browser only at call time (they drive
   * `navigator.credentials`); importing is safe anywhere.
   */
  readonly passkeys = {
    /**
     * Enrol a passkey as an MFA factor for the signed-in end user (the client
     * carries the user's access token). Resolves with the enabled factor and
     * the recovery codes; show those once.
     */
    enroll: async (opts: PasskeyBrowserOptions & { label?: string } = {}): Promise<T.ConfirmEnrollment> => {
      // Fail before the options call: an unsupported client must not mint a challenge.
      const credentials = resolveCredentials(opts);
      const start = await this.me.mfa.factors.create({ type: "webauthn", ...(opts.label ? { label: opts.label } : {}) });
      const publicKey = (start.enrollment as { public_key?: unknown }).public_key as PasskeyPublicKeyOptions;
      const credential = await createPasskeyCredential(publicKey, { ...opts, credentials });
      return this.me.mfa.factors.verify(start.factor.id, { credential: wire(credential) });
    },

    /**
     * Passwordless sign-in with a discoverable passkey. Rejects with
     * `PasskeyError` (`cancelled`) when the user dismisses the prompt, and with
     * `AuthenticationError` (401) for a forged, unknown or replayed assertion.
     */
    signIn: async (
      opts: PasskeyBrowserOptions & { mediation?: PasskeyMediation; tenant_id?: string } = {},
    ): Promise<T.ConsumerToken> => {
      const credentials = resolveCredentials(opts);
      const { public_key } = await this.passkey.options(opts.tenant_id ? { tenant_id: opts.tenant_id } : {});
      const credential = await getPasskeyCredential(public_key as PasskeyPublicKeyOptions, { ...opts, credentials });
      return this.passkey.verify({ credential: wire(credential) }) as Promise<T.ConsumerToken>;
    },

    /** Answer the MFA step of a password sign-in (`result: "mfa_required"`) with a passkey. */
    completeMfaChallenge: async (
      args: PasskeyBrowserOptions & { mfa_token: string; mediation?: PasskeyMediation },
    ): Promise<T.ConsumerToken> => {
      const { mfa_token, ...browserOpts } = args;
      const credentials = resolveCredentials(browserOpts);
      const { public_key } = await this.mfa.webauthn.options({ mfa_token });
      const credential = await getPasskeyCredential(public_key as PasskeyPublicKeyOptions, { ...browserOpts, credentials });
      return this.mfa.verify({ mfa_token, credential: wire(credential) }) as Promise<T.ConsumerToken>;
    },

    /** Re-confirm the signed-in user inside a live session before a sensitive action. */
    stepUp: async (opts: PasskeyBrowserOptions & { mediation?: PasskeyMediation } = {}): Promise<T.StepUp> => {
      const credentials = resolveCredentials(opts);
      const { public_key } = await this.me.mfa.stepUp.webauthn.options();
      const credential = await getPasskeyCredential(public_key as PasskeyPublicKeyOptions, { ...opts, credentials });
      return this.me.mfa.stepUp.verify({ credential: wire(credential) });
    },
  };
}

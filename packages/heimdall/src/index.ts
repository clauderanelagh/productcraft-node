/**
 * `@productcraft/heimdall` — typed SDK for the ProductCraft Heimdall API.
 *
 * Three caller contexts:
 *   1. Workspace-wide admin   → methods on the Heimdall instance itself
 *   2. App-scoped admin        → `heimdall.app(appId).{endUsers,roles,...}`
 *   3. Consumer-side (BFF)     → `heimdall.consumer(appSlug).{auth,me,...}`
 *
 * Plus JWT verification on consumer scopes:
 *   `heimdall.consumer(slug).verifyToken(jwt)`
 */

import type { Client } from "@kubb/plugin-client/clients/fetch";
import { PC_BASE_URL, type PCAuth, type PCClientConfig } from "@productcraft/core";

import { makeHeimdallHttpClient, HeimdallHttpError } from "./_http.js";
import { AppScope } from "./scopes/app.js";
import { ConsumerScope } from "./scopes/consumer.js";

// Workspace-level operations
import { appControllerListMyApps } from "./_generated/clients/apps/appControllerListMyApps.js";
import { appControllerCreateApp } from "./_generated/clients/apps/appControllerCreateApp.js";
import { appControllerAcceptInvite } from "./_generated/clients/apps/appControllerAcceptInvite.js";

import { idpControllerList } from "./_generated/clients/idp/idpControllerList.js";
import { idpControllerStart } from "./_generated/clients/idp/idpControllerStart.js";
import { idpControllerRedirect } from "./_generated/clients/idp/idpControllerRedirect.js";
import { idpControllerExchange } from "./_generated/clients/idp/idpControllerExchange.js";
import { idpControllerVerifyIdToken } from "./_generated/clients/idp/idpControllerVerifyIdToken.js";

import { statsControllerGetMyStats } from "./_generated/clients/platformStats/statsControllerGetMyStats.js";

// DTOs
import type { CreateAppDto } from "./_generated/types/CreateAppDto.js";
import type { AcceptInviteDto } from "./_generated/types/AcceptInviteDto.js";
import type { StartDto } from "./_generated/types/StartDto.js";
import type { ExchangeDto } from "./_generated/types/ExchangeDto.js";
import type { IdTokenVerifyDto } from "./_generated/types/IdTokenVerifyDto.js";
import type { IdpControllerStartQueryParams } from "./_generated/types/idp/IdpControllerStart.js";
import type { AppControllerListMyAppsQueryParams } from "./_generated/types/apps/AppControllerListMyApps.js";

export interface HeimdallConfig extends PCClientConfig {
  /**
   * Override the default `audience` claim expected on tokens verified
   * via `consumer(slug).verifyToken(...)`. Per-call override is also
   * available on `verifyToken`'s options.
   */
  expectedAudience?: string;
  /** Per-app JWKS cache lifetime in ms. Default 10 minutes. */
  jwksTtlMs?: number;
}

export class Heimdall {
  private readonly client: Client;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch | undefined;
  private readonly jwtConfig: { audience?: string; jwksTtlMs?: number };

  constructor(config: HeimdallConfig = {}) {
    this.baseUrl = config.baseUrl ?? PC_BASE_URL.heimdall;
    this.fetch = config.fetch;
    this.client = makeHeimdallHttpClient({
      baseUrl: this.baseUrl,
      auth: config.auth,
      fetch: this.fetch,
    });
    this.jwtConfig = {
      audience: config.expectedAudience,
      jwksTtlMs: config.jwksTtlMs,
    };
  }

  /**
   * Returns an `AppScope` bound to the given appId. All operations under
   * `/v1/apps/{appId}/...` are exposed as resource namespaces on the
   * returned object.
   */
  app(appId: string): AppScope {
    return new AppScope(appId, this.client);
  }

  /**
   * Returns a `ConsumerScope` bound to the given appSlug. Exposes the
   * `/{appSlug}/v1/...` surface (sign-in, sign-up, me, verify, oauth)
   * and the JWT-verify helper for tokens issued by this app.
   */
  consumer(appSlug: string): ConsumerScope {
    return new ConsumerScope(
      appSlug,
      { client: this.client, baseUrl: this.baseUrl, fetch: this.fetch },
      this.jwtConfig,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Workspace-wide apps surface
  // (other admin operations are under `app(appId).*` once an app exists)
  // ─────────────────────────────────────────────────────────────
  readonly apps = {
    /** List apps the caller's workspace can see. */
    list: (params: Partial<AppControllerListMyAppsQueryParams> = {}) =>
      appControllerListMyApps(
        { params: params as AppControllerListMyAppsQueryParams },
        { client: this.client },
      ),

    /** Create a new app under the caller's workspace. */
    create: (data: CreateAppDto) =>
      appControllerCreateApp({ data }, { client: this.client }),

    /** Accept a workspace invite to join an existing app. */
    acceptInvite: (data: AcceptInviteDto) =>
      appControllerAcceptInvite({ data }, { client: this.client }),
  };

  // ─────────────────────────────────────────────────────────────
  // Federated identity providers (workspace-level)
  // ─────────────────────────────────────────────────────────────
  readonly idp = {
    /** List configured IdPs. */
    list: () => idpControllerList({ client: this.client }),

    /** Begin an OAuth handshake for a provider. */
    start: (
      provider: string,
      data: StartDto,
      params: IdpControllerStartQueryParams,
    ) =>
      idpControllerStart(
        { provider, data, params },
        { client: this.client },
      ),

    /** Browser-redirect endpoint for an IdP. */
    redirect: (provider: string) =>
      idpControllerRedirect({ provider }, { client: this.client }),

    /** Exchange an IdP authorization code for a Heimdall session. */
    exchange: (data: ExchangeDto) =>
      idpControllerExchange({ data }, { client: this.client }),

    /** Verify an IdP-issued id_token (e.g. a Google ID token). */
    verifyIdToken: (provider: string, data: IdTokenVerifyDto) =>
      idpControllerVerifyIdToken(
        { provider, data },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Platform stats
  // ─────────────────────────────────────────────────────────────
  readonly stats = {
    /** Get the caller's platform-level usage / status stats. */
    get: () => statsControllerGetMyStats({ client: this.client }),
  };
}

// ─── Re-exports ────────────────────────────────────────────────
export { AppScope, ConsumerScope, HeimdallHttpError };
export type { PCAuth, PCClientConfig };

export {
  JwksCache,
  type HeimdallClaims,
  type VerifyOptions,
  verifyHeimdallToken,
  JwtVerifyError,
  JwtInvalidError,
  JwtExpiredError,
  JwtNotYetValidError,
  JwtIssuerMismatchError,
  JwtAudienceMismatchError,
  JwksKeyNotFoundError,
  JwksFetchError,
} from "./jwt/index.js";

// Re-export the most commonly-used request/response DTOs so callers
// can `import type { ConsumerSigninDto } from "@productcraft/heimdall"`.
export type { ConsumerSigninDto } from "./_generated/types/ConsumerSigninDto.js";
export type { ConsumerSignupDto } from "./_generated/types/ConsumerSignupDto.js";
export type { ConsumerTokenResponseDto } from "./_generated/types/ConsumerTokenResponseDto.js";
export type { ConsumerRefreshDto } from "./_generated/types/ConsumerRefreshDto.js";
export type { ConsumerLogoutDto } from "./_generated/types/ConsumerLogoutDto.js";
export type { ConsumerRequestResetDto } from "./_generated/types/ConsumerRequestResetDto.js";
export type { ConsumerResetPasswordDto } from "./_generated/types/ConsumerResetPasswordDto.js";
export type { UpdateMeDto } from "./_generated/types/UpdateMeDto.js";
export type { VerifyBody } from "./_generated/types/VerifyBody.js";
export type { AuthorizeBody } from "./_generated/types/AuthorizeBody.js";
export type { AuthorizeBatchBody } from "./_generated/types/AuthorizeBatchBody.js";
export type { ClientCredentialsDto } from "./_generated/types/ClientCredentialsDto.js";
export type { CreateAppDto } from "./_generated/types/CreateAppDto.js";
export type { UpdateAppDto } from "./_generated/types/UpdateAppDto.js";
export type { UpdateAppStatusDto } from "./_generated/types/UpdateAppStatusDto.js";
export type { UpdateAuthConfigDto } from "./_generated/types/UpdateAuthConfigDto.js";
export type { CreateInviteDto } from "./_generated/types/CreateInviteDto.js";
export type { AcceptInviteDto } from "./_generated/types/AcceptInviteDto.js";
export type { UpdateEndUserDto } from "./_generated/types/UpdateEndUserDto.js";
export type { UpdateEndUserRoleDto } from "./_generated/types/UpdateEndUserRoleDto.js";
export type { UpdateEndUserStatusDto } from "./_generated/types/UpdateEndUserStatusDto.js";
export type { CreateRoleDto } from "./_generated/types/CreateRoleDto.js";
export type { UpdateRoleDto } from "./_generated/types/UpdateRoleDto.js";
export type { AssignRoleDto } from "./_generated/types/AssignRoleDto.js";
export type { SetPermissionsDto } from "./_generated/types/SetPermissionsDto.js";
export type { CreatePermissionDto } from "./_generated/types/CreatePermissionDto.js";
export type { CreateApiKeyDto } from "./_generated/types/CreateApiKeyDto.js";
export type { CreateM2MClientDto } from "./_generated/types/CreateM2MClientDto.js";
export type { UpdateM2MClientDto } from "./_generated/types/UpdateM2MClientDto.js";
export type { SetScopesDto } from "./_generated/types/SetScopesDto.js";
export type { StartDto } from "./_generated/types/StartDto.js";
export type { ExchangeDto } from "./_generated/types/ExchangeDto.js";
export type { IdTokenVerifyDto } from "./_generated/types/IdTokenVerifyDto.js";

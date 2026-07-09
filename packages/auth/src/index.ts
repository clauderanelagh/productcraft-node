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

import { statsControllerGetMyStats } from "./_generated/clients/platformStats/statsControllerGetMyStats.js";

// DTOs
import type { CreateAppDto } from "./_generated/types/CreateAppDto.js";
import type { AppControllerListMyAppsQueryParams } from "./_generated/types/apps/AppControllerListMyApps.js";
import type { StatsControllerGetMyStatsQueryParams } from "./_generated/types/platformStats/StatsControllerGetMyStats.js";

export interface HeimdallConfig extends PCClientConfig {
  /** Per-app JWKS cache lifetime in ms. Default 10 minutes. */
  jwksTtlMs?: number;
}

export class Heimdall {
  private readonly client: Client;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch | undefined;
  private readonly jwtConfig: { jwksTtlMs?: number };

  constructor(config: HeimdallConfig = {}) {
    this.baseUrl = config.baseUrl ?? PC_BASE_URL.heimdall;
    this.fetch = config.fetch;
    this.client = makeHeimdallHttpClient({
      baseUrl: this.baseUrl,
      auth: config.auth,
      fetch: this.fetch,
    });
    this.jwtConfig = {
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
  };

  // ─────────────────────────────────────────────────────────────
  // Platform stats
  //
  // Workspace-level IdP admin (`/v1/idp/*`) was removed from the API
  // when consumer-side OAuth moved to per-app `auth_config_provider`
  // rows. Configure providers via the per-app auth-config endpoints
  // (`app(appId).authConfig.*`) and consume them client-side through
  // `consumer(slug).auth.signinWithProvider({ ... })`.
  // ─────────────────────────────────────────────────────────────
  readonly stats = {
    /**
     * Get the signed-in PlatformUser's aggregate counts. Pass
     * `workspaceId` to scope to a single workspace; omit to total
     * across every workspace the caller belongs to.
     */
    get: (params: Partial<StatsControllerGetMyStatsQueryParams> = {}) =>
      statsControllerGetMyStats(
        { params: params as StatsControllerGetMyStatsQueryParams },
        { client: this.client },
      ),
  };
}

// ─── Re-exports ────────────────────────────────────────────────
export { AppScope, ConsumerScope, HeimdallHttpError };
export { HEIMDALL_LEGACY_ISSUER } from "./scopes/consumer.js";
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
export type { ConsumerRequestPasswordResetDto } from "./_generated/types/ConsumerRequestPasswordResetDto.js";
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
export type { CreateEndUserInviteDto } from "./_generated/types/CreateEndUserInviteDto.js";
export type { ConsumerAcceptInviteDto } from "./_generated/types/ConsumerAcceptInviteDto.js";
export type { EndUserInviteResponseDto } from "./_generated/types/EndUserInviteResponseDto.js";
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
export type { IdpNativeSigninDto } from "./_generated/types/IdpNativeSigninDto.js";
export type { IdpNativeUserHintDto } from "./_generated/types/IdpNativeUserHintDto.js";
export type { IdpTokenResponseDto } from "./_generated/types/IdpTokenResponseDto.js";

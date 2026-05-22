/**
 * AppScope — every admin request under `/v1/apps/{appId}/...`.
 *
 * Returned by `heimdall.app(appId)`. Pre-binds the appId path param so
 * resource methods read like `app.endUsers.list()` rather than
 * `heimdall.endUsers.list({ appId })`. Methods delegate into the
 * kubb-generated client functions.
 */

import type { Client } from "@kubb/plugin-client/clients/fetch";

// App-level meta operations (under the "apps" tag, scoped to {appId})
import { appControllerGetApp } from "../_generated/clients/apps/appControllerGetApp.js";
import { appControllerUpdateApp } from "../_generated/clients/apps/appControllerUpdateApp.js";
import { appControllerDeleteApp } from "../_generated/clients/apps/appControllerDeleteApp.js";
import { appControllerUpdateAppStatus } from "../_generated/clients/apps/appControllerUpdateAppStatus.js";
import { authConfigControllerGetConfig } from "../_generated/clients/apps/authConfigControllerGetConfig.js";
import { authConfigControllerUpdateConfig } from "../_generated/clients/apps/authConfigControllerUpdateConfig.js";
import { appControllerListInvites } from "../_generated/clients/apps/appControllerListInvites.js";
import { appControllerCreateInvite } from "../_generated/clients/apps/appControllerCreateInvite.js";
import { appControllerRevokeInvite } from "../_generated/clients/apps/appControllerRevokeInvite.js";
import { appControllerListMembers } from "../_generated/clients/apps/appControllerListMembers.js";
import { appControllerRemoveMember } from "../_generated/clients/apps/appControllerRemoveMember.js";

// EndUsers — Note: `revokeAllSessions` skipped (spec bug, see callDirect below)
import { endUserControllerListEndUsers } from "../_generated/clients/endUsers/endUserControllerListEndUsers.js";
import { endUserControllerGetEndUser } from "../_generated/clients/endUsers/endUserControllerGetEndUser.js";
import { endUserControllerUpdateEndUser } from "../_generated/clients/endUsers/endUserControllerUpdateEndUser.js";
import { endUserControllerDeleteEndUser } from "../_generated/clients/endUsers/endUserControllerDeleteEndUser.js";
import { endUserControllerUpdateRole } from "../_generated/clients/endUsers/endUserControllerUpdateRole.js";
import { endUserControllerUpdateStatus } from "../_generated/clients/endUsers/endUserControllerUpdateStatus.js";

// Roles — Note: get/update/delete by roleName skipped (spec bug — see callDirect)
import { roleControllerListRoles } from "../_generated/clients/roles/roleControllerListRoles.js";
import { roleControllerCreateRole } from "../_generated/clients/roles/roleControllerCreateRole.js";
import { roleControllerAssignRole } from "../_generated/clients/roles/roleControllerAssignRole.js";
import { roleControllerSetPermissions } from "../_generated/clients/roles/roleControllerSetPermissions.js";
import { roleControllerListPermissions } from "../_generated/clients/roles/roleControllerListPermissions.js";

// Permissions
import { permissionControllerListPermissions } from "../_generated/clients/permissions/permissionControllerListPermissions.js";
import { permissionControllerCreatePermission } from "../_generated/clients/permissions/permissionControllerCreatePermission.js";
import { permissionControllerDeletePermission } from "../_generated/clients/permissions/permissionControllerDeletePermission.js";

// API keys
import { apiKeyControllerListApiKeys } from "../_generated/clients/apiKeys/apiKeyControllerListApiKeys.js";
import { apiKeyControllerCreateApiKey } from "../_generated/clients/apiKeys/apiKeyControllerCreateApiKey.js";
import { apiKeyControllerDeleteApiKey } from "../_generated/clients/apiKeys/apiKeyControllerDeleteApiKey.js";

// M2M client credentials
import { M2MControllerListClients } from "../_generated/clients/credentials/M2MControllerListClients.js";
import { M2MControllerCreateClient } from "../_generated/clients/credentials/M2MControllerCreateClient.js";
import { M2MControllerGetClient } from "../_generated/clients/credentials/M2MControllerGetClient.js";
import { M2MControllerUpdateClient } from "../_generated/clients/credentials/M2MControllerUpdateClient.js";
import { M2MControllerDeleteClient } from "../_generated/clients/credentials/M2MControllerDeleteClient.js";
import { M2MControllerRotateSecret } from "../_generated/clients/credentials/M2MControllerRotateSecret.js";
import { M2MControllerSetScopes } from "../_generated/clients/credentials/M2MControllerSetScopes.js";

// Audit logs
import { appAuditControllerGetAuditLogs } from "../_generated/clients/appAudit/appAuditControllerGetAuditLogs.js";

// DTOs
import type { UpdateAppDto } from "../_generated/types/UpdateAppDto.js";
import type { UpdateAppStatusDto } from "../_generated/types/UpdateAppStatusDto.js";
import type { UpdateAuthConfigDto } from "../_generated/types/UpdateAuthConfigDto.js";
import type { CreateInviteDto } from "../_generated/types/CreateInviteDto.js";
import type { UpdateEndUserDto } from "../_generated/types/UpdateEndUserDto.js";
import type { UpdateEndUserRoleDto } from "../_generated/types/UpdateEndUserRoleDto.js";
import type { UpdateEndUserStatusDto } from "../_generated/types/UpdateEndUserStatusDto.js";
import type { CreateRoleDto } from "../_generated/types/CreateRoleDto.js";
import type { UpdateRoleDto } from "../_generated/types/UpdateRoleDto.js";
import type { AssignRoleDto } from "../_generated/types/AssignRoleDto.js";
import type { SetPermissionsDto } from "../_generated/types/SetPermissionsDto.js";
import type { CreatePermissionDto } from "../_generated/types/CreatePermissionDto.js";
import type { CreateApiKeyDto } from "../_generated/types/CreateApiKeyDto.js";
import type { CreateM2MClientDto } from "../_generated/types/CreateM2MClientDto.js";
import type { UpdateM2MClientDto } from "../_generated/types/UpdateM2MClientDto.js";
import type { SetScopesDto } from "../_generated/types/SetScopesDto.js";

// Query-param types
import type { AppControllerListInvitesQueryParams } from "../_generated/types/apps/AppControllerListInvites.js";
import type { AppControllerListMembersQueryParams } from "../_generated/types/apps/AppControllerListMembers.js";
import type { EndUserControllerListEndUsersQueryParams } from "../_generated/types/endUsers/EndUserControllerListEndUsers.js";
import type { AppAuditControllerGetAuditLogsQueryParams } from "../_generated/types/appAudit/AppAuditControllerGetAuditLogs.js";
import type { M2MControllerListClientsQueryParams } from "../_generated/types/credentials/M2MControllerListClients.js";
import type { RoleControllerListRolesQueryParams } from "../_generated/types/roles/RoleControllerListRoles.js";

export class AppScope {
  /** The appId bound to this scope. */
  public readonly appId: string;

  private readonly client: Client;

  constructor(appId: string, client: Client) {
    this.appId = appId;
    this.client = client;
  }

  /**
   * Direct HTTP escape hatch used to call endpoints whose spec is buggy
   * — currently those whose path declares `{appId}` but whose
   * `parameters[]` omits it, so the kubb-generated code leaves the
   * URL template unfilled. Tracked upstream; remove once the spec is
   * fixed and the per-call wrappers can move back to kubb's output.
   */
  private async callDirect<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.client<T>({ method, url, data: body });
    return res.data;
  }

  // ─────────────────────────────────────────────────────────────
  // App meta — operations on the app record itself
  // ─────────────────────────────────────────────────────────────

  get = () =>
    appControllerGetApp({ appId: this.appId }, { client: this.client });

  update = (data: UpdateAppDto) =>
    appControllerUpdateApp({ appId: this.appId, data }, { client: this.client });

  delete = () =>
    appControllerDeleteApp({ appId: this.appId }, { client: this.client });

  updateStatus = (data: UpdateAppStatusDto) =>
    appControllerUpdateAppStatus(
      { appId: this.appId, data },
      { client: this.client },
    );

  // ─────────────────────────────────────────────────────────────
  // Auth config (workspace-side config for the app's auth surface)
  // ─────────────────────────────────────────────────────────────
  readonly authConfig = {
    get: () =>
      authConfigControllerGetConfig(
        { appId: this.appId },
        { client: this.client },
      ),
    update: (data: UpdateAuthConfigDto) =>
      authConfigControllerUpdateConfig(
        { appId: this.appId, data },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Invites (workspace members)
  // ─────────────────────────────────────────────────────────────
  readonly invites = {
    list: (params: Partial<AppControllerListInvitesQueryParams> = {}) =>
      appControllerListInvites(
        { appId: this.appId, params: params as AppControllerListInvitesQueryParams },
        { client: this.client },
      ),
    create: (data: CreateInviteDto) =>
      appControllerCreateInvite(
        { appId: this.appId, data },
        { client: this.client },
      ),
    revoke: (inviteId: string) =>
      appControllerRevokeInvite(
        { appId: this.appId, inviteId },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Members (workspace seats on this app)
  // ─────────────────────────────────────────────────────────────
  readonly members = {
    list: (params: Partial<AppControllerListMembersQueryParams> = {}) =>
      appControllerListMembers(
        { appId: this.appId, params: params as AppControllerListMembersQueryParams },
        { client: this.client },
      ),
    remove: (accountId: string) =>
      appControllerRemoveMember(
        { appId: this.appId, accountId },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // EndUsers (the app's authenticated users — Heimdall's bread + butter)
  // ─────────────────────────────────────────────────────────────
  readonly endUsers = {
    list: (params: Partial<EndUserControllerListEndUsersQueryParams> = {}) =>
      endUserControllerListEndUsers(
        { appId: this.appId, params: params as EndUserControllerListEndUsersQueryParams },
        { client: this.client },
      ),
    get: (userId: string) =>
      endUserControllerGetEndUser(
        { appId: this.appId, userId },
        { client: this.client },
      ),
    update: (userId: string, data: UpdateEndUserDto) =>
      endUserControllerUpdateEndUser(
        { appId: this.appId, userId, data },
        { client: this.client },
      ),
    delete: (userId: string) =>
      endUserControllerDeleteEndUser(
        { appId: this.appId, userId },
        { client: this.client },
      ),
    updateRole: (userId: string, data: UpdateEndUserRoleDto) =>
      endUserControllerUpdateRole(
        { appId: this.appId, userId, data },
        { client: this.client },
      ),
    updateStatus: (userId: string, data: UpdateEndUserStatusDto) =>
      endUserControllerUpdateStatus(
        { appId: this.appId, userId, data },
        { client: this.client },
      ),
    /** Spec bug: appId missing in spec params (see callDirect). */
    revokeAllSessions: (userId: string) =>
      this.callDirect<void>(
        "POST",
        `/v1/apps/${this.appId}/end-users/${userId}/sessions/revoke-all`,
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Roles
  // ─────────────────────────────────────────────────────────────
  readonly roles = {
    list: (params: Partial<RoleControllerListRolesQueryParams> = {}) =>
      roleControllerListRoles(
        { appId: this.appId, params: params as RoleControllerListRolesQueryParams },
        { client: this.client },
      ),
    /** Spec bug: appId missing in spec params (see callDirect). */
    get: (roleName: string) =>
      this.callDirect<unknown>("GET", `/v1/apps/${this.appId}/roles/${roleName}`),
    create: (data: CreateRoleDto) =>
      roleControllerCreateRole(
        { appId: this.appId, data },
        { client: this.client },
      ),
    /** Spec bug: appId missing in spec params (see callDirect). */
    update: (roleName: string, data: UpdateRoleDto) =>
      this.callDirect<unknown>(
        "PATCH",
        `/v1/apps/${this.appId}/roles/${roleName}`,
        data,
      ),
    /** Spec bug: appId missing in spec params (see callDirect). */
    delete: (roleName: string) =>
      this.callDirect<void>("DELETE", `/v1/apps/${this.appId}/roles/${roleName}`),
    assign: (data: AssignRoleDto) =>
      roleControllerAssignRole(
        { appId: this.appId, data },
        { client: this.client },
      ),
    setPermissions: (roleName: string, data: SetPermissionsDto) =>
      roleControllerSetPermissions(
        { appId: this.appId, roleName, data },
        { client: this.client },
      ),
    listPermissions: () =>
      roleControllerListPermissions(
        { appId: this.appId },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Permissions catalog
  // ─────────────────────────────────────────────────────────────
  readonly permissions = {
    list: () =>
      permissionControllerListPermissions(
        { appId: this.appId },
        { client: this.client },
      ),
    create: (data: CreatePermissionDto) =>
      permissionControllerCreatePermission(
        { appId: this.appId, data },
        { client: this.client },
      ),
    delete: (permissionKey: string) =>
      permissionControllerDeletePermission(
        { appId: this.appId, permissionKey },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // API keys (server-to-server platform keys for this app)
  // ─────────────────────────────────────────────────────────────
  readonly apiKeys = {
    list: () =>
      apiKeyControllerListApiKeys(
        { appId: this.appId },
        { client: this.client },
      ),
    create: (data: CreateApiKeyDto) =>
      apiKeyControllerCreateApiKey(
        { appId: this.appId, data },
        { client: this.client },
      ),
    delete: (keyId: string) =>
      apiKeyControllerDeleteApiKey(
        { appId: this.appId, keyId },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // M2M credentials (client_id + client_secret for service-to-service)
  // ─────────────────────────────────────────────────────────────
  readonly credentials = {
    list: (params: Partial<M2MControllerListClientsQueryParams> = {}) =>
      M2MControllerListClients(
        { appId: this.appId, params: params as M2MControllerListClientsQueryParams },
        { client: this.client },
      ),
    create: (data: CreateM2MClientDto) =>
      M2MControllerCreateClient(
        { appId: this.appId, data },
        { client: this.client },
      ),
    get: (clientId: string) =>
      M2MControllerGetClient(
        { appId: this.appId, clientId },
        { client: this.client },
      ),
    update: (clientId: string, data: UpdateM2MClientDto) =>
      M2MControllerUpdateClient(
        { appId: this.appId, clientId, data },
        { client: this.client },
      ),
    delete: (clientId: string) =>
      M2MControllerDeleteClient(
        { appId: this.appId, clientId },
        { client: this.client },
      ),
    rotateSecret: (clientId: string) =>
      M2MControllerRotateSecret(
        { appId: this.appId, clientId },
        { client: this.client },
      ),
    setScopes: (clientId: string, data: SetScopesDto) =>
      M2MControllerSetScopes(
        { appId: this.appId, clientId, data },
        { client: this.client },
      ),
  };

  // ─────────────────────────────────────────────────────────────
  // Audit logs
  // ─────────────────────────────────────────────────────────────
  readonly auditLogs = {
    list: (params: Partial<AppAuditControllerGetAuditLogsQueryParams> = {}) =>
      appAuditControllerGetAuditLogs(
        { appId: this.appId, params: params as AppAuditControllerGetAuditLogsQueryParams },
        { client: this.client },
      ),
  };
}

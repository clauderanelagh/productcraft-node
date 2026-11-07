// Compile-time checks (tsc -p tests/tsconfig.json): the 0.x type names and the call shapes
// conquer-api and WriteWave use on ^0.6 still type-check on 1.x, and the flagship calls are typed.
import {
  Auth,
  AuthHttpError,
  JwtExpiredError,
  JwtVerifyError,
  type AppScope,
  type AuthConfig,
  type ConsumerScope,
  type AssignRoleDto,
  type AuthorizeBatchBody,
  type AuthorizeBody,
  type ClientCredentialsDto,
  type ConfirmEnrollmentResponseDto,
  type ConsumerAcceptInviteDto,
  type ConsumerLogoutDto,
  type ConsumerRefreshDto,
  type ConsumerRequestPasswordResetDto,
  type ConsumerResetPasswordDto,
  type ConsumerSigninDto,
  type ConsumerSignupDto,
  type ConsumerTokenResponseDto,
  type CreateApiKeyDto,
  type CreateAppDto,
  type CreateEndUserInviteDto,
  type CreateM2MClientDto,
  type CreatePermissionDto,
  type CreateRoleDto,
  type EndUserInviteResponseDto,
  type IdpNativeSigninDto,
  type IdpNativeUserHintDto,
  type IdpTokenResponseDto,
  type PublicFactorDto,
  type SetPermissionsDto,
  type SetScopesDto,
  type StepUpResponseDto,
  type UpdateAppDto,
  type UpdateAppStatusDto,
  type UpdateAuthConfigDto,
  type UpdateEndUserDto,
  type UpdateEndUserRoleDto,
  type UpdateEndUserStatusDto,
  type UpdateM2MClientDto,
  type UpdateMeDto,
  type UpdateRoleDto,
  type VerifyBody,
  type WebauthnCredentialDto,
} from "../src/index.js";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T => true as T;

export async function zeroSixCallSites(config: AuthConfig, token: string): Promise<void> {
  const scope: ConsumerScope = new Auth(config).consumer("my-app");
  await scope.auth.signup({ username: "ada", email: "ada@example.com", password: "pw" });
  const session = await scope.auth.signin({ identifier: "ada", password: "pw" });
  await scope.auth.signinWithProvider({ provider: "apple", id_token: "eyJ…", nonce: "n" });
  await scope.auth.refresh({ refresh_token: "r" });
  await scope.auth.logout({ refresh_token: "r" });
  await scope.auth.verify({ code: "123456" });
  await scope.auth.sendVerificationEmail({ email: "ada@example.com" });
  await scope.auth.sendPasswordResetEmail({ email: "ada@example.com" });
  await scope.auth.resetPassword({ code: "123456", new_password: "pw2" });
  const profile = await scope.me.getProfile();
  await scope.me.updateProfile({ display_name: "Ada" });
  await scope.me.deleteAccount();
  await scope.verifyToken(token);
  const app: AppScope = new Auth(config).app("5d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a");
  await app.endUsers.get("u");
  try {
    await scope.me.getProfile();
  } catch (err) {
    if (err instanceof AuthHttpError) console.log(err.status);
    if (err instanceof JwtExpiredError || err instanceof JwtVerifyError) console.log(err.code);
  }
  // 1.x: me.getProfile() and signup() are typed (0.8 returned unknown).
  assert<Equals<typeof profile.email, string | null>>();
  console.log(profile.username);
  void session.result;
  const signup = await scope.signup({ username: "ada", email: "ada@example.com", password: "pw" });
  void signup.result;
}

export type ZeroEightTypes = [AssignRoleDto, AuthorizeBatchBody, AuthorizeBody, ClientCredentialsDto, ConfirmEnrollmentResponseDto, ConsumerAcceptInviteDto, ConsumerLogoutDto, ConsumerRefreshDto, ConsumerRequestPasswordResetDto, ConsumerResetPasswordDto, ConsumerSigninDto, ConsumerSignupDto, ConsumerTokenResponseDto, CreateApiKeyDto, CreateAppDto, CreateEndUserInviteDto, CreateM2MClientDto, CreatePermissionDto, CreateRoleDto, EndUserInviteResponseDto, IdpNativeSigninDto, IdpNativeUserHintDto, IdpTokenResponseDto, PublicFactorDto, SetPermissionsDto, SetScopesDto, StepUpResponseDto, UpdateAppDto, UpdateAppStatusDto, UpdateAuthConfigDto, UpdateEndUserDto, UpdateEndUserRoleDto, UpdateEndUserStatusDto, UpdateM2MClientDto, UpdateMeDto, UpdateRoleDto, VerifyBody, WebauthnCredentialDto];

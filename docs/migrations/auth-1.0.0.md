# Migrating to @productcraft/auth 1.0

`@productcraft/auth` 1.0 is generated from the Auth OpenAPI spec onto the shared runtime in `@productcraft/core`, like every other ProductCraft SDK: all of the Auth API's operations are methods (0.8 covered about a third of them), with auto-pagination, retries with automatic idempotency keys, typed error classes, request ids, `.withResponse()` and generated mocks. kubb and the hand-written scope wrappers are gone.

**Every 0.6 and 0.8 method name still works.** Each one is a deprecated alias of its 1.0 method, calls the same route, and is removed in 2.0 (`packages/auth/compat.json` lists them; a test checks both published versions). Your editor shows the new name on each deprecated call. The breaking changes are the few listed under [What breaks](#what-breaks). Pinned on `^0.6` or `^0.8`? You stay there until you change the range.

Node 20.3 or later is required (ESM and CommonJS on the whole range).

<!-- snippet-preamble: import { Auth, APIError, AuthenticationError, NotFoundError } from "@productcraft/auth"; const auth = new Auth(); declare const appId: string; declare const accessToken: string; -->

## Two scopes

```ts before
const app = auth.app(appId);            // admin
const scope = auth.consumer("my-app");  // end users
await scope.auth.signin({ identifier, password });
```

```ts
const admin = auth.admin.app(appId);    // `auth.app(appId)` is kept as an alias
const app = auth.consumer("my-app");    // default slug: PRODUCTCRAFT_AUTH_APP
const session = await app.signin({ identifier: "ada@example.com", password: "pw" });
await admin.endUsers.list({ limit: 100 });
console.log(session.result);
```

- The consumer scope is flattened: `consumer(slug).auth.signin()` is now `consumer(slug).signin()`. The `auth` namespace is still there as deprecated aliases.
- The consumer scope still never reads `PRODUCTCRAFT_API_KEY` (a workspace key must not travel on end-user routes); pass `auth`/`apiKey` explicitly for the PAK-gated routes (`signup` with `signup_requires_pak`, `requestVerification`, `sendVerificationEmail`, `requestPasswordReset`, `sendPasswordResetEmail`, tenant keys, factor provisioning).
- `auth.verifyToken(jwt, { app: "my-app" })` is new at the top level (one JWKS cache per app). `consumer(slug).verifyToken(jwt)`, `jwks`, `expectedIssuer`, `expectedAudience`, `acceptedIssuers` and `appSlug` are unchanged, so `@productcraft/auth-passport` works as before.
- New options on `new Auth()`: `apiKey`, `maxRetries` (default 2), `timeout` (default 60 s per attempt), `defaultHeaders`, `logLevel`, `logger`, `webhookSecret`, `dangerouslyAllowBrowser`; `jwksTtlMs` and `fetch` as before.

## Renamed and flattened methods

Every row's old name is a deprecated alias of the new one, with the same arguments, except `signinWithProvider`: the alias takes the 0.x object (`{ provider, id_token, nonce, user }`); the 1.0 method takes the provider first (`signinWithProvider("apple", { id_token, nonce })`). App-meta calls moved to the root `apps` resource, which takes the app id: `auth.app(id).get()` is `auth.apps.retrieve(id)`.

| 0.x | 1.0 |
|---|---|
| `auth.stats.get` | `auth.stats.me` |
| `auth.app(id).authConfig.get` | `auth.admin.app(id).authConfig.retrieve` |
| `auth.app(id).credentials.get` | `auth.admin.app(id).credentials.retrieve` |
| `auth.app(id).credentials.rotateSecret` | `auth.admin.app(id).credentials.rotate` |
| `auth.app(id).credentials.setScopes` | `auth.admin.app(id).credentials.updateScopes` |
| `auth.app(id).delete` | `auth.apps.delete` |
| `auth.app(id).endUsers.get` | `auth.admin.app(id).endUsers.retrieve` |
| `auth.app(id).endUsers.revokeAllSessions` | `auth.admin.app(id).endUsers.sessions.revokeAll` |
| `auth.app(id).get` | `auth.apps.retrieve` |
| `auth.app(id).invites.create` | `auth.admin.app(id).endUsers.invites.create` |
| `auth.app(id).invites.list` | `auth.admin.app(id).endUsers.invites.list` |
| `auth.app(id).invites.revoke` | `auth.admin.app(id).endUsers.invites.delete` |
| `auth.app(id).members.remove` | `auth.admin.app(id).members.delete` |
| `auth.app(id).roles.get` | `auth.admin.app(id).roles.retrieve` |
| `auth.app(id).roles.listPermissions` | `auth.admin.app(id).roles.permissions.list` |
| `auth.app(id).roles.setPermissions` | `auth.admin.app(id).roles.updatePermissions` |
| `auth.app(id).update` | `auth.apps.update` |
| `auth.consumer(slug).auth.acceptInvite` | `auth.consumer(slug).acceptInvite` |
| `auth.consumer(slug).auth.logout` | `auth.consumer(slug).logout` |
| `auth.consumer(slug).auth.refresh` | `auth.consumer(slug).refresh` |
| `auth.consumer(slug).auth.requestReset` | `auth.consumer(slug).requestPasswordReset` |
| `auth.consumer(slug).auth.requestVerification` | `auth.consumer(slug).requestVerification` |
| `auth.consumer(slug).auth.resetPassword` | `auth.consumer(slug).resetPassword` |
| `auth.consumer(slug).auth.sendPasswordResetEmail` | `auth.consumer(slug).sendPasswordResetEmail` |
| `auth.consumer(slug).auth.sendVerificationEmail` | `auth.consumer(slug).sendVerificationEmail` |
| `auth.consumer(slug).auth.signin` | `auth.consumer(slug).signin` |
| `auth.consumer(slug).auth.signinWithProvider` | `auth.consumer(slug).signinWithProvider` |
| `auth.consumer(slug).auth.signup` | `auth.consumer(slug).signup` |
| `auth.consumer(slug).auth.verify` | `auth.consumer(slug).verifyEmail` |
| `auth.consumer(slug).me.getActivity` | `auth.consumer(slug).me.activity.list` |
| `auth.consumer(slug).me.getProfile` | `auth.consumer(slug).me.retrieve` |
| `auth.consumer(slug).me.listSessions` | `auth.consumer(slug).me.sessions.list` |
| `auth.consumer(slug).me.revokeSession` | `auth.consumer(slug).me.sessions.delete` |
| `auth.consumer(slug).me.updateProfile` | `auth.consumer(slug).me.update` |
| `auth.consumer(slug).oauth.clientCredentials` | `auth.consumer(slug).oauth.token` |
| `auth.consumer(slug).verify.verify` | `auth.consumer(slug).verify.token` |

Names not in the table are unchanged (`apps.list`, `apps.create`, `app(id).endUsers.list/update/delete/updateRole/updateStatus`, `roles.list/create/update/delete/assign`, `permissions.*`, `apiKeys.*`, `credentials.list/create/update/delete`, `auditLogs.list`, `members.list`, `updateStatus`, `me.deleteAccount`, `verify.authorize`, `verify.authorizeBatch`, `passkeys.*`, `verifyToken`).

## What breaks

**Query and path parameter casing.** 0.x camelCased query parameters (kubb's `paramsCasing`); 1.0 uses the wire names, snake_case, like every other ProductCraft SDK. The fields 0.x renamed:

| Method | 0.x | 1.0 |
|---|---|---|
| `apps.list` | `workspaceId` | `workspace_id` |
| `stats.get` (now `stats.me`) | `workspaceId` | `workspace_id` |
| `app(id).auditLogs.list` | `actorId` | `actor_id` |

Every other query field (`limit`, `cursor`, `status`, `search`, `signal`, `provider`, `sort`, `order`, `action`, `since`, `until`) and every body field was already snake_case. Path parameters are positional arguments, so they have no casing.

```ts before
await auth.apps.list({ workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });
await auth.app(appId).auditLogs.list({ actorId: "u_1" });
```

```ts
await auth.apps.list({ workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" });
await auth.admin.app(appId).auditLogs.list({ actor_id: "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f" });
```

**Lists return pages.** A list method returns a `PagePromise`: `await` gives one page (`data`, `has_more`, `next_cursor`, `getNextPage()`), `for await` walks every item. 0.x resolved to the raw body, so `res.pagination.next_cursor` is now `page.next_cursor`.

```ts before
const res = await auth.app(appId).endUsers.list({ limit: 50 });
console.log(res.data, res.pagination.next_cursor);
```

```ts
const page = await auth.admin.app(appId).endUsers.list({ limit: 50 });
console.log(page.data, page.next_cursor);
for await (const user of auth.admin.app(appId).endUsers.list()) console.log(user.id);
```

**Errors.** Every API error is an `APIError` subclass by status (`BadRequestError`, `AuthenticationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, …) with `status`, `code`, `message`, `errors[]`, `requestId`, `docUrl` and the parsed `body`. `AuthHttpError` is an alias of `APIError`, so `instanceof AuthHttpError` keeps matching every API error; its 0.x fields `data` and `statusText` are gone (read `err.body`, `err.status`, `err.code`). The JWT errors (`JwtVerifyError`, `JwtExpiredError`, …) and `PasskeyError` are unchanged.

```ts before
try { await scope.auth.signin(body); } catch (err) { if (err instanceof AuthHttpError) console.log(err.status, err.data); }
```

```ts
try {
  await auth.consumer("my-app").signin({ identifier: "ada@example.com", password: "wrong" });
} catch (err) {
  if (err instanceof AuthenticationError) console.log(err.code, err.requestId);
  else if (err instanceof APIError) console.log(err.status, err.body);
}
```

**Return types.** `signup()` and `me.retrieve()` (`me.getProfile()`) are typed (0.8 returned `unknown`). Every returned object also carries a non-enumerable `lastResponse` (`requestId`, `status`, `headers`).

```ts
const me = await new Auth({ auth: { type: "bearer", token: accessToken } }).consumer("my-app").me.retrieve();
console.log(me.email, me.email_verified_at, me.lastResponse.requestId);
```

**Types.** The 0.x DTO type names (`ConsumerSigninDto`, `CreateRoleDto`, …) are still exported as deprecated aliases of the spec schemas. New code uses the `Auth` namespace: `Auth.SigninParams`, `Auth.ConsumerToken`, `Auth.EndUserSummary`. `CreateM2MClientDto`/`UpdateM2MClientDto` now point at the spec's `CreateM2mClientDto`/`UpdateM2mClientDto`.

**`AppScope` / `ConsumerScope`.** `AppScope` is the generated `auth.admin.app(id)` class, `ConsumerScope` the consumer scope; both are still exported. `callDirect` (private in 0.x) is gone.

**Browsers.** A client constructed with a workspace key in a browser throws a `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true`. Consumer routes need no key and are browser-safe.

## New in 1.0

The two thirds of Auth that 0.x could not reach: custom domains, tenants and tenant API keys, the audit sink, webhook endpoints and events, notification settings, WebAuthn config, end-user contacts, imports, exports and bulk actions on `auth.admin.app(id)`; and MFA, contacts, avatars, password change, tenants and admin users on `auth.consumer(slug)`. Webhooks Auth sends verify with `auth.webhooks.unwrap({ payload, headers })`. `@productcraft/auth/testing` exports `createMockFetch()`. The full list is in [api.md](https://github.com/clauderanelagh/productcraft-node/blob/main/packages/auth/api.md).

## auth-passport

`@productcraft/auth-passport` 1.0 declares `@productcraft/auth` as a peer dependency (`^1.0.0-0 || ^1`): install both. `createAuthJwtStrategy` and `createPassportSecretOrKeyProvider` are unchanged, and its CommonJS build now loads on Node 20.3+.

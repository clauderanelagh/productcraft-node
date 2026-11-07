# @productcraft/auth

Node.js / TypeScript client for **ProductCraft Auth**: sign-in, sign-up, sessions, profiles, MFA, passkeys and tenants for the end users of the apps you build, plus the admin API for those apps (end users, roles, permissions, API keys, M2M credentials, config, webhooks) and offline token verification.

Every HTTP method, type, error class and mock is generated from the production OpenAPI spec. Upgrading from 0.x? See the [1.0 migration guide](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-1.0.0.md): every 0.6 and 0.8 method name still works as a deprecated alias.

## Install

```sh
npm install @productcraft/auth
```

Node 20.3 or later (ESM and CommonJS), Bun, Deno and edge runtimes. Or install the umbrella package for every product: `npm install productcraft`.

## Two scopes

| Scope | Who calls it | Credential |
|---|---|---|
| `auth.consumer(slug)`: sign-in, sign-up, refresh, `me`, MFA, passkeys, tenants | Your app's backend or browser, for its end users | Depends on the route (below) |
| `auth.admin.app(appId)` (alias `auth.app(appId)`): end users, roles, keys, config, webhooks | Your backend or tooling | A workspace API key (`PRODUCTCRAFT_API_KEY`) or a platform session |

`auth.consumer()` defaults its slug to `PRODUCTCRAFT_AUTH_APP` and never reads `PRODUCTCRAFT_API_KEY`: routes that act for an end user must not carry your workspace key by accident. Pass the credential a route needs explicitly. Each method's reference entry in [api.md](./api.md#credentials) names it, and a wrong one answers 401:

| `auth.consumer(slug)` routes | Credential | How to pass it |
|---|---|---|
| `signin`, `refresh`, `verifyEmail`, `resetPassword`, `passkey.*`, `mfa.*`, `oauth.token`, `verify.*`, `wellKnown.*` | None | `auth.consumer(slug)` |
| `me.*`, `switchTenant`, `tenantApiKeys` create/list/rotate/delete | The end user's access token | `new Auth({ auth: { type: "bearer", token: accessToken } }).consumer(slug)` |
| `users.*`, `roles.*`, `permissions.*` (your backend managing the app's users) | An app API key (`hdk_live_…`, from `admin.app(id).apiKeys.create`), an M2M token, or an end user whose role holds the permission. **Not** a workspace key | `new Auth({ auth: { type: "bearer", token: process.env.AUTH_APP_API_KEY } }).consumer(slug)` |
| `tenants.*`, `users.factors.*`, `tenantApiKeys.introspect`/`status`/`config`, `requestVerification`, `sendVerificationEmail`, `requestPasswordReset`, `sendPasswordResetEmail`, `signup` (when the app requires it) | A workspace API key | `new Auth({ auth: { type: "bearer", token: process.env.PRODUCTCRAFT_API_KEY } }).consumer(slug)` |

**`consumer(slug).users` or `admin.app(id).endUsers`?** Both manage the same end users. Use `admin.app(id).endUsers` (and `.roles`, `.permissions`, `.tenants`) from your own tooling with your workspace API key: it covers more (search, export, import, bulk changes, sessions). Use `consumer(slug).users` from your product's backend when it should hold only an app-scoped credential (an app API key or M2M token), never your workspace key.

## Quick start

A new app has sign-up turned off (`signup` answers 403 "Signup is disabled for this app"). Turn it on once, with your workspace API key:

```ts
import { Auth } from "@productcraft/auth";

const auth = new Auth(); // reads PRODUCTCRAFT_API_KEY
const created = await auth.apps.create({ slug: "my-app", display_name: "My App", workspace_id: "5d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a" });
await auth.admin.app(created.id).authConfig.update({ signup_enabled: true });
```

Then sign end users up and in:

```ts
import { Auth, AuthenticationError } from "@productcraft/auth";

const auth = new Auth();
const app = auth.consumer("my-app");

// Sign in an end user. `result` says whether MFA is still needed.
const session = await app.signin({ identifier: "ada@example.com", password: "correct horse battery staple" });
if (session.result === "session") {
  // Verify the access token offline against the app's JWKS (cached per app).
  const claims = await auth.verifyToken(session.access_token, { app: "my-app" });
  console.log(claims.sub);

  // Calls as the signed-in user carry their access token.
  const me = await new Auth({ auth: { type: "bearer", token: session.access_token } }).consumer("my-app").me.retrieve();
  console.log(me.email, me.email_verified_at);
}

try {
  await app.signin({ identifier: "ada@example.com", password: "wrong" });
} catch (err) {
  if (err instanceof AuthenticationError) console.log(err.code, err.requestId);
}
```

## Admin

```ts
import { Auth } from "@productcraft/auth";

// Reads PRODUCTCRAFT_API_KEY from the environment.
const auth = new Auth();
const admin = auth.admin.app("5d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a");

for await (const user of admin.endUsers.list({ limit: 100 })) {
  console.log(user.id, user.email);
}
const endpoint = await admin.webhooks.endpoints.create({ url: "https://api.acme.com/webhooks/auth" });
console.log(endpoint.signing_secret); // shown once
```

## Verifying tokens in your backend

`auth.verifyToken(jwt, { app })` (or `auth.consumer(slug).verifyToken(jwt)`) checks the signature against the app's JWKS, the expiry, the per-app issuer (`https://api.auth.productcraft.co/<slug>`) and the audience (the slug), and refuses refresh tokens (`JwtRefreshTokenError`). Every failure is a `JwtVerifyError` subclass. For Passport, use [`@productcraft/auth-passport`](https://www.npmjs.com/package/@productcraft/auth-passport).

## Passkeys (browser)

`auth.consumer(slug).passkeys` runs whole WebAuthn ceremonies in one call each: `enroll()`, `signIn()`, `completeMfaChallenge({ mfa_token })` and `stepUp()`. They need a browser at call time; importing is safe anywhere.

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `auth.admin.app(…)`: `clone`, `updateStatus`
- `auth.admin.app(…).apiKeys`: `create`, `delete`, `list`, `rotate`
- `auth.admin.app(…).auditLogs`: `export`, `list`
- `auth.admin.app(…).auditSink`: `disconnect`, `replace`, `retrieve`, `rotateSecret`, `setupStatus`, `test`, `update`
- `auth.admin.app(…).authConfig`: `providers.check`, `providers.delete`, `providers.list`, `providers.replace`, `providers.retrieve`, `providers.update`, `retrieve`, `update`
- `auth.admin.app(…).credentials`: `create`, `delete`, `list`, `retrieve`, `rotate`, `update`, `updateScopes`
- `auth.admin.app(…).customDomains`: `apply`, `check`, `create`, `delete`, `export`, `list`, `retrieve`
- `auth.admin.app(…).endUserInsights`: `retrieve`, `users.retrieve`
- `auth.admin.app(…).endUsers`: `bulkDelete`, `bulkRevokeSessions`, `bulkUpdateRole`, `bulkUpdateStatus`, `contacts.create`, `contacts.delete`, `contacts.list`, `contacts.promote`, `contacts.resendVerification`, `delete`, `export`, `imports.create`, `imports.retrieve`, `invites.create`, `invites.delete`, `invites.list`, `list`, `mfa.requireReenrollment`, `resendVerification`, `retrieve`, `sessions.revokeAll`, `update`, `updateRole`, `updateStatus`
- `auth.admin.app(…).members`: `delete`, `list`
- `auth.admin.app(…).notificationSettings`: `retrieve`, `update`
- `auth.admin.app(…).notifications`: `test`
- `auth.admin.app(…).permissions`: `create`, `delete`, `enforcement.list`, `list`
- `auth.admin.app(…).roles`: `assign`, `create`, `delete`, `list`, `permissions.list`, `retrieve`, `update`, `updatePermissions`
- `auth.admin.app(…).setupStatus`: `retrieve`
- `auth.admin.app(…).signInTests`: `create`, `retrieve`
- `auth.admin.app(…).tenantApiKeys`: `config.retrieve`, `config.update`, `delete`, `list`
- `auth.admin.app(…).tenants`: `create`, `delete`, `invites.create`, `invites.delete`, `invites.list`, `list`, `members.create`, `members.delete`, `members.list`, `members.update`, `retrieve`, `update`
- `auth.admin.app(…).unverifiedAccountExpiry`: `retrieve`, `run`
- `auth.admin.app(…).webauthnConfig`: `retrieve`, `update`
- `auth.admin.app(…).webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`
- `auth.apps`: `create`, `delete`, `list`, `retrieve`, `update`
- `auth.consumer(…)`: `acceptInvite`, `acceptTenantInvite`, `exchangeProviderCode`, `logout`, `refresh`, `requestPasswordReset`, `requestVerification`, `resetPassword`, `sendPasswordResetEmail`, `sendVerificationEmail`, `signin`, `signinWithProvider`, `signup`, `switchTenant`, `verifyEmail`
- `auth.consumer(…).me`: `activity.list`, `changePassword`, `contacts.create`, `contacts.delete`, `contacts.list`, `contacts.promote`, `deleteAccount`, `deleteAvatar`, `mfa.factors.create`, `mfa.factors.delete`, `mfa.factors.list`, `mfa.factors.verify`, `mfa.recoveryCodes.regenerate`, `mfa.stepUp.sendCode`, `mfa.stepUp.verify`, `mfa.stepUp.webauthn.options`, `permissions`, `retrieve`, `sessions.delete`, `sessions.list`, `tenantInvites.accept`, `tenants.list`, `update`, `uploadAvatar`
- `auth.consumer(…).mfa`: `enroll`, `recover`, `sendCode`, `verify`, `verifyEnrollment`, `webauthn.options`
- `auth.consumer(…).oauth`: `introspect`, `token`
- `auth.consumer(…).passkey`: `options`, `verify`
- `auth.consumer(…).permissions`: `create`, `delete`, `list`
- `auth.consumer(…).roles`: `create`, `delete`, `list`, `retrieve`, `update`, `updatePermissions`
- `auth.consumer(…).tenantApiKeys`: `config.retrieve`, `config.update`, `create`, `delete`, `introspect`, `list`, `rotate`, `status`
- `auth.consumer(…).tenants`: `create`, `delete`, `invites.create`, `invites.delete`, `invites.list`, `list`, `members.create`, `members.delete`, `members.list`, `members.update`, `retrieve`, `update`
- `auth.consumer(…).users`: `create`, `delete`, `factors.create`, `factors.delete`, `factors.list`, `list`, `retrieve`, `update`, `updateRole`, `updateStatus`
- `auth.consumer(…).verify`: `authorize`, `authorizeBatch`, `token`
- `auth.consumer(…).wellKnown`: `jwks`, `openidConfiguration`
- `auth.stats`: `me`, `retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of auth.apps.list({ limit: 50 })) console.log(item);
const page = await auth.apps.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await auth.apps.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Auth, NotFoundError, RateLimitError, APIError } from "@productcraft/auth";
const auth = new Auth();
try {
  await auth.apps.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

## Retries and timeouts

Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` are retried twice by default with exponential backoff and jitter, honouring `Retry-After` up to 60 s. A POST or PATCH without an idempotency key is never retried. Each attempt times out after 60 s, so the worst case with defaults is about 3 minutes; pass `signal: AbortSignal.timeout(ms)` for an overall deadline.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ maxRetries: 3, timeout: 20_000 });
await auth.apps.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const app = await auth.apps.create({
  display_name: "Acme",
  slug: "acme-app",
  workspace_id: "835015dc-7bde-4a8a-b306-c066d4733b90",
}, { idempotencyKey: "order-1234" });
```

## Webhooks

`auth.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Auth.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_AUTH_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth();
export async function POST(req: Request) {
  const event = await auth.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "app.slug_changed":
      console.log(event.data);
      break;
    default:
      break; // UnknownWebhookEvent: types added later
  }
  return new Response(null, { status: 204 });
}
```

Express (keep the body raw):

```ts
import express from "express";
import { Auth } from "@productcraft/auth";
const auth = new Auth();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await auth.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Auth } from "@productcraft/auth";
const auth = new Auth();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await auth.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await auth.webhooks.sign({ payload: { id: "evt_test_1", type: "app.slug_changed", created_at: new Date().toISOString(), data: {} } });
const event = await auth.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await auth.apps.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await auth.apps.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/auth/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name. It also exports `signWebhook({ payload, secret })`, which signs a test event for your webhook handler (the same as `webhooks.sign()`, without a client).

```ts
import { Auth } from "@productcraft/auth";
import { createMockFetch } from "@productcraft/auth/testing";
const fetch = createMockFetch();
const auth = new Auth({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await auth.apps.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Auth } from "@productcraft/auth";
const auth = new Auth({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await auth.client.GET("/v1/apps");
console.log(data, error);
```

<!-- generated:end -->

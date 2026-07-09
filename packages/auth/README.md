# @productcraft/auth

Typed Node.js SDK for the [ProductCraft Auth](https://productcraft.co) auth platform.

```bash
npm install @productcraft/auth
```

Server-side only. For React / Next.js apps, call this from your backend (BFF pattern) — the SDK ships an API key in headers.

## Quick start

```ts
import { Auth } from "@productcraft/auth";

const auth = new Auth({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});
```

The SDK splits into three caller contexts.

### 1. Workspace-wide admin

```ts
// /v1/apps, /v1/stats/me
const apps = await auth.apps.list();

// Create requires display_name + workspace_id (not `name`).
await auth.apps.create({
  display_name: "My App",
  slug: "my-app",
  workspace_id: "<workspace-uuid>",
});

const stats = await auth.stats.get();
```

### 2. App-scoped admin — `auth.app(appId)`

Pre-binds the appId path param so resource methods read like `app.endUsers.list()`.

```ts
const app = auth.app("<app-uuid>");

// EndUsers — profile updates only carry { display_name?, email? }.
// Status / role transitions are separate calls.
const users = await app.endUsers.list({ limit: "20", cursor: "..." });
await app.endUsers.update(userId, { display_name: "Alice Smith" });
await app.endUsers.updateStatus(userId, { status: "active" });
await app.endUsers.revokeAllSessions(userId);

// Roles — `CreateRoleDto` is { name, description? }. Permissions are
// bound separately, after the role exists.
await app.roles.create({ name: "admin", description: "Billing admin" });
await app.roles.setPermissions("admin", { permissions: ["billing.read"] });
await app.roles.assign({ userId, roleName: "admin" });
await app.permissions.list();

// API keys — permissions[] is required even if empty.
await app.apiKeys.create({ name: "ci", permissions: [] });

// M2M credentials
const m2m = await app.credentials.create({ name: "backend-svc" });

// Audit + invites + auth config (camelCase post-pipe)
await app.auditLogs.list({ limit: "100" });
await app.authConfig.update({ passwordMinLength: 12 });
```

### 3. Consumer-side (BFF) — `auth.consumer(appSlug)`

For backend route handlers mediating auth between your SPA and Auth. Pre-binds the appSlug.

```ts
const consumer = auth.consumer("my-app-slug");

// Sign-in
const { access_token, refresh_token } = await consumer.auth.signin({
  identifier: "alice@example.com",
  password: "...",
});

// Sign-up requires { email, password, username, display_name? } — not `identifier`.
await consumer.auth.signup({
  email: "alice@example.com",
  password: "...",
  username: "alice",
});

await consumer.auth.refresh({ refresh_token });
await consumer.auth.logout({ refresh_token });
await consumer.auth.requestReset({ email });
await consumer.auth.resetPassword({ token, new_password: "..." });

// Sign in with Apple (native iOS flow). See "Federated sign-in" below.
await consumer.auth.signinWithProvider({
  provider: "apple",
  id_token: identityTokenFromAppleSdk,
  nonce: rawNonceClientGenerated,
  user: { name: "Alice Doe" }, // first sign-in only
});

// Me — for the signed-in EndUser (pass their token via auth config)
await consumer.me.getProfile();
await consumer.me.listSessions();
await consumer.me.revokeSession(sessionId);

// Verify (server-to-server permission checks)
await consumer.verify.verify({ token });
await consumer.verify.authorize({ token, permission: "billing.read" });

// M2M (client_credentials grant)
await consumer.oauth.clientCredentials({ clientId, clientSecret, scope });
```

> **Wire-shape note.** Auth's JSON wire is snake_case, and the SDK returns response objects as-is (e.g. `access_token`, `refresh_token`, `token_type`, `expires_in`). Request DTOs follow the same convention; some convenience fields (`identifier`, `password`, `nonce`) are unaffected, but anywhere the spec uses an underscore the SDK does too.

## Federated sign-in (Apple, Google)

`consumer.auth.signinWithProvider` lets a BFF exchange a provider-issued identity token for an Auth `{ access_token, refresh_token }` pair. The endpoint creates the EndUser on first sign-in and returns the same account on subsequent ones — the SDK is a thin wrapper over Auth's `POST /{appSlug}/v1/auth/oauth/{provider}` which does the heavy lifting (Apple JWKS verification, issuer pinning, audience validation against the app's configured native client ids, server-side nonce replay protection, account creation / linking).

```ts
import { Auth, AuthHttpError } from "@productcraft/auth";

const auth = new Auth();
const consumer = auth.consumer("my-app-slug");

const tokens = await consumer.auth.signinWithProvider({
  provider: "apple",
  // The value of `ASAuthorizationAppleIDCredential.identityToken` after
  // UTF-8 decoding the data; pass through your BFF unchanged.
  id_token: identityToken,
  // Raw nonce the client generated and SHA-256-hashed into the
  // authorize request. Auth recomputes sha256(nonce) and compares
  // to the token's `nonce` claim.
  nonce: rawNonce,
  // Apple sends `{ name, email }` ONLY on the very first sign-in.
  // Pass through on that call; omit on subsequent ones.
  user: { name: "Alice Doe", email: "alice@example.com" },
});
```

### Account linking

When the verified provider claim's `email` matches an existing EndUser's verified primary email, the app's `oauth_link_policy` decides the outcome:

| Policy | Behavior |
|---|---|
| `auto` (default) | Silently link the provider identity to the existing account. Only when the provider claims `email_verified: true` AND the email is **not** an Apple private relay. |
| `confirm` | Refuse with `409 link_required`. UI should sign the user in via their original method, then bind the provider identity through a follow-up flow. |
| `reject` | Refuse with `409 account_exists_with_different_provider`. |

Configure per-app via the auth-config endpoints (Auth-admin → "Auth config" → "OAuth link policy").

### Apple private-relay emails

Apple often returns `*@privaterelay.appleid.com` for users who hide their email. Auth persists it **as-is** on the EndUser's primary email contact — you don't need to translate it on your side. Private-relay addresses never participate in `auto`-link (they're nominally verified but not deliverable through channels you control).

### First-sign-in name fields

Apple only sends `givenName` / `familyName` on the very first sign-in. Pass them as a combined string through `user.name` on that call — Auth persists it to the EndUser's display name. Subsequent sign-ins should omit `user` entirely; Auth keeps whatever was stored on the first call.

### Error handling

```ts
try {
  await consumer.auth.signinWithProvider({ provider: "apple", id_token, nonce });
} catch (err) {
  if (err instanceof AuthHttpError) {
    // err.status: 401 = bad signature / issuer / audience / nonce / expired
    //             409 = link_required | account_exists_with_different_provider
    //             4xx/5xx = other surface errors
    // err.data: parsed JSON body with `code` / `message` for the 409 family
  }
  throw err;
}
```

`AuthHttpError` is the same exception family every other surface method throws — one filter handles all of them.

### Google (and future providers)

The Auth API uses a single `POST /{appSlug}/v1/auth/oauth/{provider}` endpoint for every supported IdP — the `provider` URL segment selects the verifier. Once Google is enabled on Auth's side, the SDK call becomes:

```ts
await consumer.auth.signinWithProvider({
  provider: "google",
  id_token: tokenFromGoogleSignInSdk,
  nonce: rawNonce,
});
```

No SDK upgrade required — the per-provider TS enum widens automatically with the next spec refresh.

## JWT verification

Every Auth app publishes a JWKS at `/{appSlug}/v1/.well-known/jwks.json`. The SDK gives you a verified-claims helper and a jose-compatible JWKS resolver.

### Token claim shape

Auth EndUser access tokens carry, at minimum:

| Claim | Example | Notes |
|---|---|---|
| `alg` (header) | `RS256` | Signing algorithm — RS256 from the per-app keystore. |
| `kid` (header) | `rs256-<key-id>` | Selects the public key from the per-app JWKS. |
| `iss` | `https://api.auth.productcraft.co/<appSlug>` | Per-app issuer URL. Available on the SDK as `scope.expectedIssuer`. |
| `aud` | `<appSlug>` | The app slug (literal). Available as `scope.expectedAudience`. |
| `sub` | `<account-uuid>` | The EndUser's account id — what your local user table should key on. |
| `aid` | `<app-uuid>` | The Auth app uuid (matches `scope.appId` if you held it). |
| `sid` | `<session-uuid>` | Session row id — useful for revoke-this-session ops. |
| `role` | `member` | The EndUser's role in this app. |
| `type` | `end_user` \| `m2m` | Distinguishes EndUser tokens from M2M (client_credentials) tokens. |
| `amr` | `["pwd"]` \| `["oauth.apple"]` | Auth-method-reference array — how this session was established. |
| `iat`, `exp` | unix seconds | Standard. |

Tokens issued before the 2026-05-24 per-app-issuer migration carried `iss: "heimdall"` (no URL) and **no** `aud` claim. `scope.acceptedIssuers` includes both the new URL form and the legacy literal so existing tokens keep verifying through their TTL; `scope.verifyToken(token)` handles this automatically. If you wire `jose.jwtVerify` directly, pass `issuer: scope.acceptedIssuers` (an array) for the transition window, or `issuer: scope.expectedIssuer` once you're sure no legacy tokens are live.

### One-line verify (the 80% case)

```ts
import { Auth, JwtExpiredError } from "@productcraft/auth";

const auth = new Auth();
const scope = auth.consumer("my-app-slug");

try {
  const claims = await scope.verifyToken(token);
  // claims.sub, claims.aid, claims.sid, claims.role, claims.amr, ...
} catch (err) {
  if (err instanceof JwtExpiredError) { /* trigger refresh */ }
  throw err;
}
```

Behind the scenes: JWKS fetched once, cached in-memory (10 min TTL by default), singleflighted so 100 concurrent verifies do 1 fetch, auto-refetched if a token's `kid` isn't in the cached JWKS (rotation handling). Issuer + audience are checked against `scope.acceptedIssuers` + `scope.expectedAudience` automatically.

### Building blocks for `jose`, NestJS guards, Hono, etc.

`scope.jwks.getKey` is a [jose-compatible](https://github.com/panva/jose) key resolver — pass it anywhere a `GetKeyFunction` is expected.

```ts
import { jwtVerify } from "jose";

const scope = auth.consumer("my-app-slug");
const { payload } = await jwtVerify(token, scope.jwks.getKey, {
  issuer: scope.expectedIssuer,        // "https://api.auth.productcraft.co/<appSlug>"
  audience: scope.expectedAudience,    // "<appSlug>"
  algorithms: ["RS256"],
});
```

For the per-app boundary, the JWKS is the cryptographic gate (only the app's keystore can sign these), but pinning `iss` + `aud` rejects a token minted for a *different* app on the same platform before the signature ever gets checked — defence in depth at a higher layer.

### Passport integration

Use the companion package [`@productcraft/auth-passport`](../auth-passport):

```bash
npm install @productcraft/auth-passport passport-jwt
```

```ts
import passportJwt from "passport-jwt";
import { createPassportSecretOrKeyProvider } from "@productcraft/auth-passport";

const scope = auth.consumer("my-app-slug");
new passportJwt.Strategy(
  {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
    issuer: scope.expectedIssuer,        // per-app URL
    audience: scope.expectedAudience,    // appSlug
    algorithms: ["RS256"],
  },
  (payload, done) => done(null, payload),
);
```

## Error handling

```ts
import {
  JwtVerifyError,           // base — catch this if you don't care which sub-kind
  JwtInvalidError,
  JwtExpiredError,
  JwtNotYetValidError,
  JwtIssuerMismatchError,
  JwtAudienceMismatchError,
  JwksKeyNotFoundError,
  JwksFetchError,
  AuthHttpError,         // any non-2xx HTTP response
} from "@productcraft/auth";
```

## Configuration

```ts
new Auth({
  // Auth credential the SDK presents to Auth
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  // Override the prod base URL — useful for dev / staging
  baseUrl: "https://api.auth.example.test",
  // Custom fetch (undici with retry, mock in tests, ...)
  fetch: customFetch,
  // JWKS cache TTL — default 10 minutes
  jwksTtlMs: 10 * 60 * 1000,
});
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.auth.productcraft.co/docs-json`. The 4,000+ lines of types + per-operation client functions in `src/_generated/` are produced by [kubb](https://kubb.dev/); the thin resource classes (~600 lines of `app.ts` / `consumer.ts`) wrap those into the namespace structure shown above.

When the spec changes, the nightly `spec-refresh` workflow re-runs codegen and opens a PR with the diff. Type-safe consumers get the latest API surface automatically.

## License

[MIT](../../LICENSE).

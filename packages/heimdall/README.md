# @productcraft/heimdall

Typed Node.js SDK for the [ProductCraft Heimdall](https://productcraft.co) auth platform.

```bash
npm install @productcraft/heimdall
```

Server-side only. For React / Next.js apps, call this from your backend (BFF pattern) — the SDK ships an API key in headers.

## Quick start

```ts
import { Heimdall } from "@productcraft/heimdall";

const heimdall = new Heimdall({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});
```

The SDK splits into three caller contexts.

### 1. Workspace-wide admin

```ts
// /v1/apps, /v1/idp/*, /v1/stats/me
const apps = await heimdall.apps.list();
await heimdall.apps.create({ name: "My App", slug: "my-app" });
await heimdall.idp.list();
await heimdall.stats.get();
```

### 2. App-scoped admin — `heimdall.app(appId)`

Pre-binds the appId path param so resource methods read like `app.endUsers.list()`.

```ts
const app = heimdall.app("app_xyz_uuid");

// EndUsers
const users = await app.endUsers.list({ limit: "20", cursor: "..." });
await app.endUsers.update(userId, { status: "active" });
await app.endUsers.revokeAllSessions(userId);

// Roles / Permissions
await app.roles.create({ name: "admin", permissions: ["billing.read"] });
await app.roles.assign({ userId, roleName: "admin" });
await app.permissions.list();

// API keys + M2M creds
await app.apiKeys.create({ name: "ci" });
const m2m = await app.credentials.create({ name: "backend-svc" });

// Audit + invites + auth config
await app.auditLogs.list({ limit: "100" });
await app.authConfig.update({ passwordPolicy: { minLength: 12 } });
```

### 3. Consumer-side (BFF) — `heimdall.consumer(appSlug)`

For backend route handlers mediating auth between your SPA and Heimdall. Pre-binds the appSlug.

```ts
const consumer = heimdall.consumer("my-app-slug");

// Sign-in flows
const { access_token, refresh_token } = await consumer.auth.signin({
  identifier: "alice@example.com",
  password: "...",
});
await consumer.auth.signup({ identifier, password });
await consumer.auth.refresh({ refresh_token });
await consumer.auth.logout({ refresh_token });
await consumer.auth.requestReset({ email });
await consumer.auth.resetPassword({ code, newPassword });

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

> **Wire-shape note.** Heimdall's JSON wire is snake_case, and the SDK returns response objects as-is (e.g. `access_token`, `refresh_token`, `token_type`, `expires_in`). Request DTOs follow the same convention; some convenience fields (`identifier`, `password`, `nonce`) are unaffected, but anywhere the spec uses an underscore the SDK does too.

## Federated sign-in (Apple, Google)

`consumer.auth.signinWithProvider` lets a BFF exchange a provider-issued identity token for a Heimdall `{ access_token, refresh_token }` pair. The endpoint creates the EndUser on first sign-in and returns the same account on subsequent ones — the SDK is a thin wrapper over Heimdall's `POST /{appSlug}/v1/auth/oauth/{provider}` which does the heavy lifting (Apple JWKS verification, issuer pinning, audience validation against the app's configured native client ids, server-side nonce replay protection, account creation / linking).

```ts
import { Heimdall, HeimdallHttpError } from "@productcraft/heimdall";

const heimdall = new Heimdall();
const consumer = heimdall.consumer("my-app-slug");

const tokens = await consumer.auth.signinWithProvider({
  provider: "apple",
  // The value of `ASAuthorizationAppleIDCredential.identityToken` after
  // UTF-8 decoding the data; pass through your BFF unchanged.
  id_token: identityToken,
  // Raw nonce the client generated and SHA-256-hashed into the
  // authorize request. Heimdall recomputes sha256(nonce) and compares
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

Configure per-app via the auth-config endpoints (Heimdall-admin → "Auth config" → "OAuth link policy").

### Apple private-relay emails

Apple often returns `*@privaterelay.appleid.com` for users who hide their email. Heimdall persists it **as-is** on the EndUser's primary email contact — you don't need to translate it on your side. Private-relay addresses never participate in `auto`-link (they're nominally verified but not deliverable through channels you control).

### First-sign-in name fields

Apple only sends `givenName` / `familyName` on the very first sign-in. Pass them as a combined string through `user.name` on that call — Heimdall persists it to the EndUser's display name. Subsequent sign-ins should omit `user` entirely; Heimdall keeps whatever was stored on the first call.

### Error handling

```ts
try {
  await consumer.auth.signinWithProvider({ provider: "apple", id_token, nonce });
} catch (err) {
  if (err instanceof HeimdallHttpError) {
    // err.status: 401 = bad signature / issuer / audience / nonce / expired
    //             409 = link_required | account_exists_with_different_provider
    //             4xx/5xx = other surface errors
    // err.data: parsed JSON body with `code` / `message` for the 409 family
  }
  throw err;
}
```

`HeimdallHttpError` is the same exception family every other surface method throws — one filter handles all of them.

### Google (and future providers)

The Heimdall API uses a single `POST /{appSlug}/v1/auth/oauth/{provider}` endpoint for every supported IdP — the `provider` URL segment selects the verifier. Once Google is enabled on Heimdall's side, the SDK call becomes:

```ts
await consumer.auth.signinWithProvider({
  provider: "google",
  id_token: tokenFromGoogleSignInSdk,
  nonce: rawNonce,
});
```

No SDK upgrade required — the per-provider TS enum widens automatically with the next spec refresh.

## JWT verification

Every Heimdall app publishes a JWKS at `/{appSlug}/v1/.well-known/jwks.json`. The SDK gives you a verified-claims helper and a jose-compatible JWKS resolver.

### One-line verify (the 80% case)

```ts
import { Heimdall, JwtExpiredError } from "@productcraft/heimdall";

const heimdall = new Heimdall();
const scope = heimdall.consumer("my-app-slug");

try {
  const claims = await scope.verifyToken(token);
  // claims.sub, claims.email, claims.role, claims.permissions, ...
} catch (err) {
  if (err instanceof JwtExpiredError) { /* trigger refresh */ }
  throw err;
}
```

Behind the scenes: JWKS fetched once, cached in-memory (10 min TTL by default), singleflighted so 100 concurrent verifies do 1 fetch, auto-refetched if a token's `kid` isn't in the cached JWKS (rotation handling).

### Building blocks for `jose`, NestJS guards, Hono, etc.

`scope.jwks.getKey` is a [jose-compatible](https://github.com/panva/jose) key resolver — pass it anywhere a `GetKeyFunction` is expected.

```ts
import { jwtVerify } from "jose";

const scope = heimdall.consumer("my-app-slug");
const { payload } = await jwtVerify(token, scope.jwks.getKey, {
  issuer: scope.expectedIssuer, // the literal string "heimdall"
});
```

Heimdall Consumer-API tokens are not minted with an `aud` claim — the per-app boundary is enforced by the JWKS, not the issuer string or the audience. If you mint custom tokens with the heimdall key and want to enforce an audience, pass `audience` to `jose.jwtVerify` or `scope.verifyToken(token, { audience: "..." })` per-call.

### Passport integration

Use the companion package [`@productcraft/heimdall-passport`](../heimdall-passport):

```bash
npm install @productcraft/heimdall-passport passport-jwt
```

```ts
import passportJwt from "passport-jwt";
import { createPassportSecretOrKeyProvider } from "@productcraft/heimdall-passport";

const scope = heimdall.consumer("my-app-slug");
new passportJwt.Strategy(
  {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
    issuer: scope.expectedIssuer,
    algorithms: ["ES256"],
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
  HeimdallHttpError,         // any non-2xx HTTP response
} from "@productcraft/heimdall";
```

## Configuration

```ts
new Heimdall({
  // Auth credential the SDK presents to Heimdall
  auth: { type: "apiKey", key: "pcft_live_..." }
      | { type: "bearer", token: "eyJ..." }
      | { type: "cookie", value: "auth_token=..." },
  // Override the prod base URL — useful for dev / staging
  baseUrl: "https://api.heimdall.example.test",
  // Custom fetch (undici with retry, mock in tests, ...)
  fetch: customFetch,
  // JWKS cache TTL — default 10 minutes
  jwksTtlMs: 10 * 60 * 1000,
});
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.heimdall.productcraft.co/docs-json`. The 4,000+ lines of types + per-operation client functions in `src/_generated/` are produced by [kubb](https://kubb.dev/); the thin resource classes (~600 lines of `app.ts` / `consumer.ts`) wrap those into the namespace structure shown above.

When the spec changes, the nightly `spec-refresh` workflow re-runs codegen and opens a PR with the diff. Type-safe consumers get the latest API surface automatically.

## License

[MIT](../../LICENSE).

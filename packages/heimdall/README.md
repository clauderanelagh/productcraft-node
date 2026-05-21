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
const { accessToken, refreshToken } = await consumer.auth.signin({
  identifier: "alice@example.com",
  password: "...",
});
await consumer.auth.signup({ identifier, password });
await consumer.auth.refresh({ refreshToken });
await consumer.auth.logout({ refreshToken });
await consumer.auth.requestReset({ email });
await consumer.auth.resetPassword({ token, password });

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
  issuer: scope.expectedIssuer,
  audience: "my-app",
});
```

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
  // Expected JWT `aud` claim for `consumer(slug).verifyToken(...)`. Optional.
  expectedAudience: "my-app",
  // JWKS cache TTL — default 10 minutes
  jwksTtlMs: 10 * 60 * 1000,
});
```

## How this SDK is built

Generated from the live OpenAPI spec at `https://api.heimdall.productcraft.co/docs-json`. The 4,000+ lines of types + per-operation client functions in `src/_generated/` are produced by [kubb](https://kubb.dev/); the thin resource classes (~600 lines of `app.ts` / `consumer.ts`) wrap those into the namespace structure shown above.

When the spec changes, the nightly `spec-refresh` workflow re-runs codegen and opens a PR with the diff. Type-safe consumers get the latest API surface automatically.

## License

[MIT](../../LICENSE).

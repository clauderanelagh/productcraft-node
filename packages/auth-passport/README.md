# @productcraft/auth-passport

Passport-JWT adapter for [`@productcraft/auth`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/auth). Plug an Auth `ConsumerScope` into a `passport-jwt` Strategy so existing Passport setups can authenticate Auth-issued tokens.

Upgrading? 1.0 and 2.0 only moved the `@productcraft/auth` peer range; see the [1.0](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-passport-1.0.0.md) and [2.0](https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/auth-passport-2.0.0.md) migration guides.

```bash
npm install @productcraft/auth @productcraft/auth-passport passport-jwt
```

## Usage

`createAuthJwtStrategy` builds the whole strategy from an Auth `ConsumerScope`: JWKS-backed key lookup, the app's issuer and audience, `RS256`, and refresh tokens refused before your callback runs.

```ts
import passport from "passport";
import { Auth } from "@productcraft/auth";
import { createAuthJwtStrategy } from "@productcraft/auth-passport";

// Verification needs no credential. The slug can also come from PRODUCTCRAFT_AUTH_APP.
const scope = new Auth().consumer("my-app-slug");

passport.use(
  createAuthJwtStrategy(scope, (claims, done) => {
    // claims is the verified Auth claims object (sub, role, permissions, ...)
    done(null, claims);
  }),
);
```

Options: `jwtFromRequest` (another token source, such as a cookie), `algorithms`, `strictIssuer` (accept only the per-app issuer URL, not the legacy `"heimdall"` literal) and `passReqToCallback`.

### Your own Strategy options

To build the `passport-jwt` Strategy yourself, pass `createPassportSecretOrKeyProvider(scope)` as `secretOrKeyProvider`. Its type matches passport-jwt's `SecretOrKeyProvider`, so no cast is needed:

```ts
import passportJwt from "passport-jwt";
import { Auth } from "@productcraft/auth";
import { createPassportSecretOrKeyProvider } from "@productcraft/auth-passport";

const scope = new Auth().consumer("my-app-slug");

const strategy = new passportJwt.Strategy(
  {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
    issuer: [...scope.acceptedIssuers],
    audience: scope.expectedAudience,
    algorithms: ["RS256"],
  },
  (payload: Record<string, unknown>, done: passportJwt.VerifiedCallback) => {
    done(null, payload);
  },
);
```

The provider decodes the JWT header, asks the `ConsumerScope` for the matching signing key through its cached JWKS, converts the `CryptoKey` into a Node `KeyObject`, and hands it to passport-jwt. Unlike `createAuthJwtStrategy`, this form does not refuse refresh tokens: check `isRefreshToken(payload)` from `@productcraft/auth` in your verify callback if your app issues them.

## How it relates to the main package

`@productcraft/auth` already ships a `scope.verifyToken(token)` one-liner. Use **this** package only when you have an existing Passport setup you'd rather keep. For Express middleware without Passport, the direct verify is simpler.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).

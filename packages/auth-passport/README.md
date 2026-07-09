# @productcraft/auth-passport

Passport-JWT adapter for [`@productcraft/auth`](../auth). Plug an Auth `ConsumerScope` into a `passport-jwt` Strategy so existing Passport setups can authenticate Auth-issued tokens.

```bash
npm install @productcraft/auth @productcraft/auth-passport passport-jwt
```

## Usage

```ts
import passportJwt from "passport-jwt";
import { Auth } from "@productcraft/auth";
import { createPassportSecretOrKeyProvider } from "@productcraft/auth-passport";

const auth = new Auth({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});
const scope = auth.consumer("my-app-slug");

new passportJwt.Strategy(
  {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
    issuer: scope.expectedIssuer,
    audience: "my-app", // optional
    algorithms: ["ES256"],
  },
  (payload, done) => {
    // payload is the verified Auth claims object (sub, role, permissions, ...)
    return done(null, payload);
  },
);
```

The helper decodes the JWT header, asks the Auth `ConsumerScope` for the matching signing key via its cached JWKS, converts the resulting `CryptoKey` into a Node `KeyObject`, and hands it to passport-jwt.

## How it relates to the main package

`@productcraft/auth` already ships a `scope.verifyToken(token)` one-liner. Use **this** package only when you have an existing Passport setup you'd rather keep. For Express middleware without Passport, the direct verify is simpler.

## License

[MIT](../../LICENSE).

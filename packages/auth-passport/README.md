# @productcraft/heimdall-passport

Passport-JWT adapter for [`@productcraft/heimdall`](../heimdall). Plug a Heimdall `ConsumerScope` into a `passport-jwt` Strategy so existing Passport setups can authenticate Heimdall-issued tokens.

```bash
npm install @productcraft/heimdall @productcraft/heimdall-passport passport-jwt
```

## Usage

```ts
import passportJwt from "passport-jwt";
import { Heimdall } from "@productcraft/heimdall";
import { createPassportSecretOrKeyProvider } from "@productcraft/heimdall-passport";

const heimdall = new Heimdall({
  auth: { type: "apiKey", key: process.env.PCFT_KEY! },
});
const scope = heimdall.consumer("my-app-slug");

new passportJwt.Strategy(
  {
    jwtFromRequest: passportJwt.ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKeyProvider: createPassportSecretOrKeyProvider(scope),
    issuer: scope.expectedIssuer,
    audience: "my-app", // optional
    algorithms: ["ES256"],
  },
  (payload, done) => {
    // payload is the verified Heimdall claims object (sub, role, permissions, ...)
    return done(null, payload);
  },
);
```

The helper decodes the JWT header, asks the Heimdall `ConsumerScope` for the matching signing key via its cached JWKS, converts the resulting `CryptoKey` into a Node `KeyObject`, and hands it to passport-jwt.

## How it relates to the main package

`@productcraft/heimdall` already ships a `scope.verifyToken(token)` one-liner. Use **this** package only when you have an existing Passport setup you'd rather keep. For Express middleware without Passport, the direct verify is simpler.

## License

[MIT](../../LICENSE).

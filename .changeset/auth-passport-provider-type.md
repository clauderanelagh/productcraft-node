---
"@productcraft/auth-passport": minor
---

`createPassportSecretOrKeyProvider(scope)` now passes to `new passportJwt.Strategy({ secretOrKeyProvider })` without a cast: its `done` callback is typed `(err, secretOrKey?: string | Buffer)`, the same as `SecretOrKeyProvider` in `@types/passport-jwt`, which rejected the `KeyObject` in the old signature (TS2769). The type is now exported as `PassportSecretOrKeyProvider`. Runtime is unchanged; the key is still a Node `KeyObject`, which `jsonwebtoken` accepts. The README quick start now shows `createAuthJwtStrategy` and a hand-built Strategy, both typechecked in CI, and links migration guides for 1.0 and 2.0.

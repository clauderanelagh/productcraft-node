---
"@productcraft/auth": minor
"@productcraft/auth-passport": minor
---

**Security fix: offline verification now refuses refresh tokens.** `scope.verifyToken()` / `verifyAuthToken()` used to accept a validly signed refresh JWT as if it were an access token, so a backend verifying offline could be authenticated with a leaked refresh token. Tokens with `token_use: "refresh"` or `type: "refresh"` now throw the new `JwtRefreshTokenError` (code `ERR_JWT_REFRESH_TOKEN`, a `JwtVerifyError`), and `createAuthJwtStrategy` fails authentication for them before your verify callback runs. A new `isRefreshToken(claims)` helper is exported for hand-rolled `jose` verification. This matches the server-side checks in the Auth and Platform APIs. Upgrade if you verify Auth tokens offline.

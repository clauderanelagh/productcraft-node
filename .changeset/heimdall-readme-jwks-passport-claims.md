---
"@productcraft/heimdall": patch
---

README: correct JWKS + passport guidance against the live token shape.

Verified live (2026-05-25) by signing up a Conquer EndUser against `api.heimdall.productcraft.co/conquer` and decoding the access token. Three stale claims fixed:

- **Issuer** is the per-app URL (`https://api.heimdall.productcraft.co/<appSlug>`), not the literal `"heimdall"`. The previous README's `// the literal string "heimdall"` comment dated from before the 2026-05-24 per-app-issuer migration. `scope.expectedIssuer` already returns the URL form; documented alongside `scope.acceptedIssuers` (URL + legacy) for callers wiring `jose.jwtVerify` during the transition window.
- **Audience IS minted on every token** (`aud: "<appSlug>"`), exposed as `scope.expectedAudience`. Previous README said "tokens are not minted with an `aud` claim" — out of date. Both the one-line `verifyToken` path and `jose.jwtVerify` now show the audience check.
- **Algorithm is RS256**, not ES256. The keystore that signs Consumer tokens is `Rs256KeyService`. Passport example corrected.

Also added a "Token claim shape" table near the top of the JWT-verification section so callers can see `sub` / `aid` / `sid` / `role` / `type` / `amr` / `iat` / `exp` at a glance without decoding a sample token.

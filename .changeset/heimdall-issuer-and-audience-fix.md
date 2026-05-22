---
"@productcraft/heimdall": minor
---

Fix `consumer(slug).verifyToken` issuer check + drop the dead `expectedAudience` config.

The v0.1.0 SDK derived `expectedIssuer` as `baseUrl + appSlug` (`https://api.heimdall.productcraft.co/my-app`). The Heimdall Consumer API actually mints every token with `iss: "heimdall"` (literal string) — the per-app boundary is enforced by the per-app JWKS, not by varying the issuer claim. Result: `scope.verifyToken(...)` always failed with `JwtIssuerMismatchError` against real tokens. Fixed to use the literal `"heimdall"`.

Heimdall Consumer-API tokens are also not minted with an `aud` claim, so the `expectedAudience` config option was a footgun — setting it always caused verification to fail. Removed from `HeimdallConfig`. Callers who mint custom tokens with the heimdall key can still pass `audience` per-call via `verifyToken(token, { audience: "..." })`.

Tests + README updated to match. The new exported constant `HEIMDALL_CONSUMER_ISSUER` documents the issuer string for callers wiring their own `jose.jwtVerify`.

**Breaking** (pre-1.0): the `expectedAudience` field on `HeimdallConfig` is gone. Anyone passing it must remove it. Anyone who relied on the broken issuer check passing through silently (it didn't — verifyToken always threw) should now see green token verification.

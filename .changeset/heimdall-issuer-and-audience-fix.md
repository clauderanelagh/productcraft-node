---
"@productcraft/heimdall": minor
"@productcraft/heimdall-passport": minor
---

Per-app issuer + audience on Consumer-API token verification, and a shorter passport-jwt helper.

The v0.1.0 SDK derived `expectedIssuer` as `baseUrl + appSlug` (`https://api.heimdall.productcraft.co/my-app`). The Heimdall Consumer API at the time minted every token with `iss: "heimdall"` (literal string), so `scope.verifyToken(...)` always threw `JwtIssuerMismatchError`.

The right fix landed on the server side: tokens now mint with `iss: <heimdallApiPublicUrl>/<appSlug>` (e.g. `https://api.heimdall.productcraft.co/my-app`) and `aud: <appSlug>`. The per-app issuer gives customers something meaningful to pin in their verifier — a token minted for another app on the platform now fails the `iss` check at the application layer too, not just by JWKS-fetch-targeting.

`@productcraft/heimdall` changes:
- `scope.expectedIssuer` is back to the URL form: `${baseUrl}/${appSlug}`.
- `scope.expectedAudience` is new and equals the app slug.
- `scope.acceptedIssuers` is new — the array of issuer strings `verifyToken` accepts (per-app URL + the legacy `"heimdall"` literal) during the transition window.
- `scope.verifyToken(token)` now enforces `aud` by default; pass `{ audience: undefined }` to skip.
- `HEIMDALL_CONSUMER_ISSUER` is renamed to `HEIMDALL_LEGACY_ISSUER` — same value, clearer name.
- The `expectedAudience` config option on `HeimdallConfig` (introduced as a stub in earlier drafts) is removed; pin audience by-call via `verifyToken(token, { audience: "..." })` if you mint custom tokens with the heimdall key.

`@productcraft/heimdall-passport` changes:
- New `createHeimdallJwtStrategy(scope, verify, opts?)` helper builds a fully-configured `passport-jwt` strategy in one call — wires `secretOrKeyProvider`, `issuer` (both per-app URL + legacy literal), `audience` (app slug), `jwtFromRequest` (default: bearer header), and `algorithms` (default: `["RS256"]`). The previous example required ~10 lines of boilerplate per app; now it's 3.
- `createPassportSecretOrKeyProvider(scope)` stays available for callers who want to compose with `passport-jwt`'s `new Strategy(...)` directly.

**Breaking** (pre-1.0):
- `HEIMDALL_CONSUMER_ISSUER` is gone — replace with `HEIMDALL_LEGACY_ISSUER` if you reference it, or just use `scope.expectedIssuer` / `scope.acceptedIssuers` from a `ConsumerScope` instance.
- `scope.expectedIssuer` is no longer the literal `"heimdall"` string. Code that pins to the literal must switch to `scope.expectedIssuer` (the per-app URL) or `scope.acceptedIssuers` (both forms during the migration window).
- `verifyToken` now enforces `aud === scope.expectedAudience` by default — pass `{ audience: undefined }` if you don't want this.

---
'@productcraft/auth': minor
'@productcraft/auth-passport': minor
'@productcraft/mail': minor
'@productcraft/waitlist': minor
'@productcraft/social': minor
'@productcraft/core': minor
'productcraft': minor
---

Rename the per-product packages to the rebranded product names — the
final step of the ProductCraft rebrand (Heimdall→Auth, Envoi→Mail,
Rally→Waitlist, Agora→Social):

- `@productcraft/heimdall` → `@productcraft/auth` (class `Heimdall` → `Auth`)
- `@productcraft/heimdall-passport` → `@productcraft/auth-passport`
  (`createHeimdallJwtStrategy` → `createAuthJwtStrategy`)
- `@productcraft/envoi` → `@productcraft/mail` (class `Envoi` → `Mail`)
- `@productcraft/rally` → `@productcraft/waitlist` (class `Rally` → `Waitlist`)
- `@productcraft/agora` → `@productcraft/social` (class `Agora` → `Social`)
- `@productcraft/core`: `PC_BASE_URL` keys renamed to match
  (`heimdall`→`auth`, `envoi`→`mail`, `rally`→`waitlist`, `agora`→`social`)
- `productcraft` umbrella: accessors renamed (`pc.auth`, `pc.mail`,
  `pc.waitlist`, `pc.social`); per-surface config overrides moved under
  a nested `overrides` key because the Auth surface's flat `auth` key
  would collide with the shared `auth` credential field.

Wire contracts are unchanged: the legacy consumer JWT issuer literal
stays `"heimdall"` (exported as `AUTH_LEGACY_ISSUER`), `pcft:heimdall:` /
`pcft:envoi:` resource URNs, `ENVOI_*` error codes, and all old hosts
keep working. The old npm package names remain published and receive a
deprecation notice pointing here.

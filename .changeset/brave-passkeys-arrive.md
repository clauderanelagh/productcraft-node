---
"@productcraft/auth": minor
---

Passkey (WebAuthn) helpers on the consumer scope. `auth.consumer(slug).passkeys` gains
`enroll()`, `signIn()` (passwordless), `completeMfaChallenge({ mfa_token })` and `stepUp()`,
each wrapping the options call, `navigator.credentials`, and the verify call with base64url
handled in both directions. The guide's encoding layer is exported for customers who want the
pieces (`toB64u`, `fromB64u`, `decodeOptions`, `encodeCredential`, `createPasskeyCredential`,
`getPasskeyCredential`), alongside `isPasskeySupported()` and a typed `PasskeyError`
(`unsupported` / `cancelled` / `timeout` / `invalid_state` / `security` / `no_credential` /
`unknown`). Nothing touches a browser global at import time, so the package still loads in Node.
Also refreshes the vendored Auth spec, which adds the generated clients for every
`/auth/passkey/*`, `/auth/mfa/webauthn/*`, `/me/mfa/*` and `/v1/apps/:id/webauthn-config` route.

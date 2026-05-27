---
"@productcraft/heimdall": minor
---

Add typed wrappers for the email-verification flow on `ConsumerScope.auth`.

Three new methods, each thin proxies into the kubb-generated clients:

- **`auth.requestVerification(data)`** — mints a 6-digit contact-verification code for delivery via your own channel. Returns `{ code, expires_at }` on match, `{}` on no-match / already-verified (uniform shape — no account enumeration). PAK-required, `heimdall.user.verify.create`.
- **`auth.sendVerificationEmail(data)`** — mints a fresh code AND dispatches it via the workspace's verified Envoi sender. Returns `{ expires_at }` on success; plaintext code is never returned. Surfaces typed 412 / 503 precondition errors instead of the silent fail-closed of a fire-and-forget mailer. PAK-required, `heimdall.user.verify.send-email`.
- **`auth.verify(data)`** — public consume. Submits the 6-digit code, flips the bound contact's `verified_at`, returns `{ account_id, email_verified_at }`. 410 on invalid / expired / consumed code.

Until now downstream consumers had to either pin to the raw HTTP endpoints or fall back to the internal `callDirect` escape hatch (Conquer ships exactly that workaround on `apps/conquer-api/src/auth/auth.controller.ts` and will swap once this version lands).

Also fixes the contradictory `oauth_link_policy` docstring on `signinWithProvider`: the canonical default in the Heimdall source is `confirm`, not `auto`. The previous draft documented `auto` as default; now matches the `UpdateAuthConfigDto` description.

Test coverage: 6 new specs on `scope.test.ts` — happy-path URL/body/Authorization for each method, plus 401 propagation on PAK-missing mints and 410 propagation on the verify consume.

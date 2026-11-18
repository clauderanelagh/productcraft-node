---
"@productcraft/auth": minor
---

Passwordless email sign-in: `consumer(slug).email.config()`, `email.start({ email })` and `email.verify({ flow_id, code | token })` (magic link and 6-digit code, sign-up and sign-in in one flow), `passwordless_email` on the auth config, the `sign_in` notification template slot and `seed_defaults`, and an `mfa_required` outcome on `exchangeProviderCode`. Also picks up the agent-access and other Auth API additions since the last refresh.

---
"@productcraft/auth": minor
"@productcraft/mail": minor
"@productcraft/social": minor
"@productcraft/trawl": minor
---

From the app-waitlist review, in the generator:

- **`signWebhook()` in `/testing`.** Every product with webhooks exports `signWebhook({ payload, secret })` from `@productcraft/<product>/testing`. It signs a test event the way ProductCraft signs deliveries, for a webhook handler test that has no client (the same as `webhooks.sign()`).
- **Enum path arguments are typed.** A positional argument whose path parameter is an enum takes that union instead of `string`, so `auth.consumer(slug).auth.signinWithProvider("facebook", ...)` no longer compiles. A `string` variable needs narrowing to the union first.

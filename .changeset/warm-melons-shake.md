---
"@productcraft/auth": minor
---

Add `consumer(slug).auth.sendPasswordResetEmail()` — mints a password-reset code **and** dispatches it via Mail in one call, the counterpart to the existing `sendVerificationEmail()`.

The `send-password-reset-email` route has existed on the API for a while but was never exposed on the SDK, so the only reachable reset method was `requestReset()` — which mints a code and returns it without sending anything. Apps wiring a plain "forgot password" flow to `requestReset()` got a `2xx`, discarded the returned code, and silently sent no mail. `requestReset()`'s docs now state that it does not email, and both methods cross-reference each other.

`requestReset()` also now carries its real return type (`ConsumerCodeIssueResponseDto`) instead of an inferred one.

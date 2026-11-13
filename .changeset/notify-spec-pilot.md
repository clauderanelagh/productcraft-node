---
"@productcraft/notify": minor
---

Spec refresh: `effective_quiet_hours` on preference sets (the window that applies: the recipient's own or the workspace default), the `default_off` delivery reason (a channel off by default that the recipient never turned on, distinct from `suppressed_preference`), `cancellation_key` limited to `A-Z a-z 0-9 . _ : @ | -`, and Idempotency-Keys may contain dots (`invoice.paid:inv_123`).

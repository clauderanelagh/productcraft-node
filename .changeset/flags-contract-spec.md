---
"@productcraft/flags": minor
"@productcraft/platform-auth": minor
---

Spec refresh. `@productcraft/flags`: every management method now documents `UNAUTHORIZED` (401) and the retryable `MANAGEMENT_UNAVAILABLE` (503, `Retry-After`) errors. Environment, config, setting and segment keys carry their pattern and length limits in the types and docs, and the evaluation warning `iso_date_converted` is now typed. `@productcraft/platform-auth`: the Flags and Notify key presets (`flags`, `flags-dev`, `notify-send`, `notify-readonly`) and the `flags` and `notify` products are now typed.

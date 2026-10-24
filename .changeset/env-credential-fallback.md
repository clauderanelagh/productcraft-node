---
"@productcraft/core": minor
"@productcraft/auth": minor
"@productcraft/mail": minor
"@productcraft/waitlist": minor
"@productcraft/social": minor
"@productcraft/trawl": minor
"@productcraft/platform-auth": minor
"productcraft": minor
---

Credentials from the environment. Server-side, omit `auth` and every client reads your `pcft_` workspace key from `PRODUCTCRAFT_API_KEY`; an explicit `auth` still wins. `auth.consumer()` now takes an optional slug that defaults to `PRODUCTCRAFT_AUTH_APP`, and consumer routes never read a credential from the environment (pass `auth` explicitly for PAK-only consumer routes). Hosts are never read from the environment: override them in code with `baseUrl`. No fallback happens where there is no `process` global (browsers).

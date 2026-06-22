---
"@productcraft/core": patch
---

Retarget default base URLs to the canonical post-rebrand production
domains:

- `rally` → `api.waitlist.productcraft.co` (Rally → Waitlist)
- `envoi` → `api.mail.productcraft.co` (Envoi → Mail)
- `agora` → `social.productcraft.co` (Agora → Feed → Social)
- `heimdall` → `api.auth.productcraft.co` (Heimdall → Auth; the Auth
  product now owns `api.auth`)
- `platformAuth` → `api.platform-auth.productcraft.co` (the platform
  identity layer moved off `api.auth` so the Auth product could take it
  — pointing the SDK at `api.auth` for platform calls would now hit the
  wrong service)

Old hosts (`api.rally`, `feed`/`agora`, `api.heimdall`, `api.users`,
and `api.auth` for platform) stay live as aliases during the
deprecation window, so this is a non-breaking retarget. The surface
keys/classes (`rally`/`agora`/`heimdall`) are intentionally kept; the
public-API rename to `waitlist`/`social`/`auth` lands in v1.0.0.

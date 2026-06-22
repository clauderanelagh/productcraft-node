---
"@productcraft/core": patch
---

Retarget default base URLs for the platform-auth re-domain:

- `platformAuth` → `api.platform-auth.productcraft.co` — the platform
  identity layer vacated `api.auth` so the customer-facing Auth product
  could take it. Pointing the SDK at `api.auth` for platform calls would
  now hit the wrong service.
- `heimdall` (the Auth product) → `api.auth.productcraft.co` (its new
  canonical host; `api.users` / `api.heimdall` stay as aliases).
- `agora` → `social.productcraft.co` (Agora → Feed → Social).

Non-breaking — old hosts remain live as aliases. Surface keys/classes
unchanged until the v1.0.0 rename.

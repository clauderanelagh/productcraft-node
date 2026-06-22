# @productcraft/core

## 0.0.5

### Patch Changes

- 734798c: Retarget default base URLs for the platform-auth re-domain:
  - `platformAuth` → `api.platform-auth.productcraft.co` — the platform
    identity layer vacated `api.auth` so the customer-facing Auth product
    could take it. Pointing the SDK at `api.auth` for platform calls would
    now hit the wrong service.
  - `heimdall` (the Auth product) → `api.auth.productcraft.co` (its new
    canonical host; `api.users` / `api.heimdall` stay as aliases).
  - `agora` → `social.productcraft.co` (Agora → Feed → Social).

  Non-breaking — old hosts remain live as aliases. Surface keys/classes
  unchanged until the v1.0.0 rename.

## 0.0.4

### Patch Changes

- d18aa84: Retarget default base URLs to the renamed production services: Rally→Waitlist
  (`api.waitlist.productcraft.co`), Agora→Feed (`feed.productcraft.co`), and
  Heimdall→users (`api.users.productcraft.co`). Envoi/Mail (`api.mail`) and
  Platform-Auth (`api.auth`) are unchanged. The surface keys/classes
  (`rally`/`agora`/`heimdall`) are intentionally kept, so this is a non-breaking
  retarget; the public-API rename to `waitlist`/`feed`/`users` lands in v1.0.0.

## 0.0.3

### Patch Changes

- 52b6058: Add READMEs so npmjs.com renders documentation for each package instead of "This package does not have a README." No functional changes.

## 0.0.2

### Patch Changes

- 47e7e8c: Verify the CI release pipeline + trusted publishing end-to-end.

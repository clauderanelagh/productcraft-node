# @productcraft/core

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

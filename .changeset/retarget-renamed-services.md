---
"@productcraft/core": patch
---

Retarget default base URLs to the renamed production services: Rally→Waitlist
(`api.waitlist.productcraft.co`), Agora→Feed (`feed.productcraft.co`), and
Heimdall→users (`api.users.productcraft.co`). Envoi/Mail (`api.mail`) and
Platform-Auth (`api.auth`) are unchanged. The surface keys/classes
(`rally`/`agora`/`heimdall`) are intentionally kept, so this is a non-breaking
retarget; the public-API rename to `waitlist`/`feed`/`users` lands in v1.0.0.

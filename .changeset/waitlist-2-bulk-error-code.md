---
"@productcraft/waitlist": major
---

**Breaking: `lists.entries.bulk()` row errors carry the string error code.** A failed row is `{ code, status_code, message }`, where `code` is a `Waitlist.ErrorCode` (`NOT_FOUND`, `CONFLICT`, ...) like a thrown error's; the HTTP status moved from `code` to `status_code`. The Waitlist API already sends this shape, so 1.x types were wrong at runtime. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-2.0.0.md

Also: `settings.notifications.test(slot)` takes the slot union (`"welcome" | "approved" | "rejected"`), `@productcraft/waitlist/testing` exports `signWebhook()`, and the `lists.analytics.timeline` reference example passes a valid range.

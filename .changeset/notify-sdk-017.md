---
"@productcraft/notify": minor
"@productcraft/core": minor
"productcraft": minor
---

New package `@productcraft/notify` (preview): one call notifies a user across an in-app inbox, email (through ProductCraft Mail), web push, APNs and FCM.

- `Notify`: the generated client for recipients (`identify`, `bulkIdentify`, devices, preferences, timeline, erasure), categories, notification types and their per-channel templates (versions, revert, `replaceByKey`), `notifications.send` (always with an `Idempotency-Key`; `dry_run` typed), cancel and retract, deliveries, recipient tokens (`recipientTokens.mint`, `recipients.revokeTokens`, `settings.revokeAllTokens`), channels (APNs and FCM credentials you upload, VAPID keys), settings, setup status, stats, export and webhooks with typed events (`webhooks.unwrap`).
- `notify.client({ token })`: browser- and app-safe calls for one recipient (inbox list, counts, mark, interact; device registration; web push key; preferences) with the short-lived recipient token your backend mints. It sends only that token, never an API key, and refuses a `pcft_` key. `notify.client` is still the typed `openapi-fetch` escape hatch (`notify.client.GET(…)`).
- `@productcraft/notify/testing`: the generated `createMockFetch()`.
- `productcraft`: `pc.notify`.
- `@productcraft/core`: `PC_BASE_URL.notify`.

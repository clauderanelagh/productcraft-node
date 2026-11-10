---
"@productcraft/notify-js": minor
---

New package: `@productcraft/notify-js`, the framework-agnostic browser and React Native client for ProductCraft Notify. `createNotifyClient({ getToken })` gives an inbox store (cache, `loadMore`, optimistic `markRead` / `markSeen` / `markAllRead` / `archive` / `unarchive`, `interact` for action buttons, `onNew` for toasts, `category` and `tenant` filters) with real-time updates over a fetch-stream SSE reader (Bearer token, `Last-Event-ID`, backoff with jitter, counts polling fallback, paused while the tab is hidden), per-cell preference updates, `devices.unregister` for sign-out, and `registerWebPush` with the `notify-sw.js` service worker (also exported as a string from `@productcraft/notify-js/sw`). Recipient tokens are refreshed on expiry and kept in memory only.

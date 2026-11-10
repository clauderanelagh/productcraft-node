# @productcraft/notify-js

## 0.2.0

### Minor Changes

- 3368b2e: `client.preferences` is now a store: `subscribe(listener)` (loads on the first subscriber) and `getState()` give the cached preferences for preference screens, and `update(cells, extra?)` changes the cache at once, keeps the server's answer for the last update in flight and rolls back on failure. `get()` and `update()` keep their call shapes. New `resolvePreference(prefs, category, channel)` returns what a category × channel switch shows (and whether it is mandatory).

## 0.1.0

### Minor Changes

- 4325f22: New package: `@productcraft/notify-js`, the framework-agnostic browser and React Native client for ProductCraft Notify. `createNotifyClient({ getToken })` gives an inbox store (cache, `loadMore`, optimistic `markRead` / `markSeen` / `markAllRead` / `archive` / `unarchive`, `interact` for action buttons, `onNew` for toasts, `category` and `tenant` filters) with real-time updates over a fetch-stream SSE reader (Bearer token, `Last-Event-ID`, backoff with jitter, counts polling fallback, paused while the tab is hidden), per-cell preference updates, `devices.unregister` for sign-out, and `registerWebPush` with the `notify-sw.js` service worker (also exported as a string from `@productcraft/notify-js/sw`). Recipient tokens are refreshed on expiry and kept in memory only.

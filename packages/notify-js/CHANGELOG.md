# @productcraft/notify-js

## 0.2.3

### Patch Changes

- Updated dependencies [810d5ac]
  - @productcraft/notify@0.2.0

## 0.2.2

### Patch Changes

- a2f5b93: `registerWebPush` waits for the service worker to activate before subscribing. On a first visit Chrome refused the subscription ("no active Service Worker"), so users had to press the button two or three times.

## 0.2.1

### Patch Changes

- 01bee2f: `notify-sw.js` shows link buttons too: a web push button with only a `url` opens it, and the press is recorded on the inbox item. Notify now sends the inbox `item_id` and its buttons with every web push, so the worker's buttons and `interact` work end to end.
- Updated dependencies [01bee2f]
  - @productcraft/notify@0.1.1

## 0.2.0

### Minor Changes

- 3368b2e: `client.preferences` is now a store: `subscribe(listener)` (loads on the first subscriber) and `getState()` give the cached preferences for preference screens, and `update(cells, extra?)` changes the cache at once, keeps the server's answer for the last update in flight and rolls back on failure. `get()` and `update()` keep their call shapes. New `resolvePreference(prefs, category, channel)` returns what a category × channel switch shows (and whether it is mandatory).

## 0.1.0

### Minor Changes

- 4325f22: New package: `@productcraft/notify-js`, the framework-agnostic browser and React Native client for ProductCraft Notify. `createNotifyClient({ getToken })` gives an inbox store (cache, `loadMore`, optimistic `markRead` / `markSeen` / `markAllRead` / `archive` / `unarchive`, `interact` for action buttons, `onNew` for toasts, `category` and `tenant` filters) with real-time updates over a fetch-stream SSE reader (Bearer token, `Last-Event-ID`, backoff with jitter, counts polling fallback, paused while the tab is hidden), per-cell preference updates, `devices.unregister` for sign-out, and `registerWebPush` with the `notify-sw.js` service worker (also exported as a string from `@productcraft/notify-js/sw`). Recipient tokens are refreshed on expiry and kept in memory only.

---
"@productcraft/notify-js": minor
---

`client.preferences` is now a store: `subscribe(listener)` (loads on the first subscriber) and `getState()` give the cached preferences for preference screens, and `update(cells, extra?)` changes the cache at once, keeps the server's answer for the last update in flight and rolls back on failure. `get()` and `update()` keep their call shapes. New `resolvePreference(prefs, category, channel)` returns what a category × channel switch shows (and whether it is mandatory).

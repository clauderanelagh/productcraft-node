---
"@productcraft/flags": minor
---

A browser and React Native build of `FlagsClient`: the `browser` and `react-native` export conditions resolve to a build without Node-only code (no `node:` import, no `process.env`). In a page it sends no `If-None-Match` (the browser HTTP cache revalidates, no CORS preflight) and auto polling pauses while the tab is hidden. `overrides.file` and `overrides.env` stay Node-only. A key used in a browser or mobile app makes its whole config public: give client flags their own config with no internal rules.

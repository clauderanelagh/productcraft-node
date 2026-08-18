---
"@productcraft/auth": patch
---

README: document the mint-vs-dispatch distinction for one-time codes.

The consumer quick start taught `requestReset()` as the forgot-password recipe. That method mints a code and returns it without sending anything, so following the README verbatim produced a flow that returned `2xx` and silently emailed nobody. The quick start now uses `sendPasswordResetEmail()`, and a new table contrasts all four `request*` / `send*` methods, notes the separate PAK permissions, and covers the typed `412` Mail-precondition errors. Also fixes `resetPassword` in the example, which named a `token` field that doesn't exist (it's `code`).

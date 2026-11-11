---
"@productcraft/notify-js": patch
---

`notify-sw.js` shows link buttons too: a web push button with only a `url` opens it, and the press is recorded on the inbox item. Notify now sends the inbox `item_id` and its buttons with every web push, so the worker's buttons and `interact` work end to end.

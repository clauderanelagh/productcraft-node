---
"@productcraft/notify-js": patch
---

`registerWebPush` waits for the service worker to activate before subscribing. On a first visit Chrome refused the subscription ("no active Service Worker"), so users had to press the button two or three times.

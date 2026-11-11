---
"@productcraft/notify": patch
---

Refreshed from the live Notify API: every operation documents its `401` and the `ErrorResponseDto` error envelope, the removed error codes `MAIL_NOT_ENABLED`, `EMAIL_PAUSED` and `EMAIL_BACKLOG_FULL` are gone, and client routes name `SERVICE_NOT_ENABLED` (Notify turned off for the workspace). The README now points at `@productcraft/notify-js` and `@productcraft/notify-react`, which have shipped.

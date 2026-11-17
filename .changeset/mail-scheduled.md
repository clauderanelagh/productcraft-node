---
"@productcraft/mail": minor
---

Scheduled sends: `scheduled_at` on `emails.send()`, batch rows and `templates.send()`, `emails.update(id, { scheduled_at })` to reschedule and `emails.cancel(id)` to cancel; `scheduled` and `canceled` message statuses and `scheduled_at` on emails and messages.

---
"@productcraft/mail": minor
---

Attachments and inline images: `attachments` on `emails.send()` and `templates.send()` (base64 `content` or an https `path`, optional `content_type`, `content_id` for `cid:` images; up to 20 files, 10 MB per email), the `attachments` list on `emails.retrieve()` and `messages.retrieve()`, and `emails.attachments.retrieve(id, position)` to download one. New error codes `MAIL_ATTACHMENT_*` and `ATTACHMENT_NOT_FOUND`.

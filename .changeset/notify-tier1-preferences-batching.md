---
"@productcraft/notify": minor
---

Hosted preference page and batching:

- `notify.recipients.createPreferenceLink(externalId, { category_key? })`: a signed, year-long link to the page Notify hosts where a recipient switches categories per channel, sets quiet hours and a time zone, or unsubscribes from everything (critical types excepted). Notify emails already link to it from their one-click unsubscribe header and as `{{{preferences_url}}}`.
- `notify.settings.update({ branding })`: name, logo, accent colour and privacy link of that page.
- `batch` on notification types: a window (fixed or sliding, per data key) or a daily/weekly digest at the recipient's local time. Email and push send one message per batch rendered with `batch.count`, `batch.items` and `batch.actors`; the inbox collapses.
- `notify.batches.list()`, `.retrieve(batchId)` and `.flush(batchId)`; deliveries carry `batch_id`, and dry runs say which batch a send would join.

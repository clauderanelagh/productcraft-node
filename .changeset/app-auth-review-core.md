---
"@productcraft/core": minor
---

Pagination stops with a `ProductCraftError` when the API returns a `next_cursor` the walk already sent, instead of fetching the same page forever (`for await`, `.pages()`, `getNextPage()`). New `signWebhook()` (and `APIClient.signWebhook`) signs a test event the way ProductCraft signs deliveries (Standard Webhooks), so a handler test needs no hand-rolled HMAC.

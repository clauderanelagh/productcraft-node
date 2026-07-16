---
"@productcraft/social": minor
---

Regenerate from the Social API wire-consistency release (breaking-change batch B7): the acting actor is `actor_id` everywhere (query on reads, body on writes; old names deprecated), DELETEs take `?actor_id=` instead of a request body, every list surfaces the `{ data, pagination }` envelope, and the batch view endpoint is now `POST /posts/impressions` (gated on `social.view`; `/posts/views` kept as a deprecated alias). Update calls to the new parameter names before the next major.

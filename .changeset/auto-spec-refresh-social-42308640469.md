---
"@productcraft/social": patch
---

Refresh social OpenAPI types from production (monorepo social-api/045). `.client` types now carry the SDK names (`x-pc-sdk`), typed webhook events, `format: uuid` / `date-time` on ids and timestamps, named enums, and the acting actor as `actor_id` everywhere: the old role-named fields (`caller_actor_id`, `owner_actor_id`, `owner_id`, `approver_actor_id`, `reporter_actor_id`, `viewer_actor_id`) are still accepted and typed, marked deprecated. Member adds take `actor_id` + `member_actor_id`. Two type corrections: the `limit` query of the muted-terms list is an integer, and DELETE routes that only rejected a removed body field no longer declare a (necessarily empty) request body.

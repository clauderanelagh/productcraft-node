---
"@productcraft/social": minor
---

Social spec refresh — deprecated alias removal (task 029, breaking):
the legacy actor parameter names (`requester_id`, `viewer_actor_id`,
`src_actor_id`, `sender_id`, DELETE-body actor forms), `POST
/posts/views`, `PATCH /conversations/:id/name`, and the
conversation-level `muted`/`muted_until`/`pinned` fields are gone from
the surface. Requests using them fail with 400/404 — use `actor_id`,
`/posts/impressions`, conversation-level `name`, and the
`/members/:actorId` route.

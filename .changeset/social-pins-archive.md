---
"@productcraft/social": minor
---

Add pinned comments and post archive state. Comments gain `pinned`/`pinned_at` and `POST`/`DELETE /posts/{postId}/comments/{commentId}/pin`. Posts gain the `archived` status and `GET /actors/{actorId}/archived`. Community settings gain `max_pinned_comments`.

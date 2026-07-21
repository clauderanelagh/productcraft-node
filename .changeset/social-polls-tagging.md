---
"@productcraft/social": minor
---

Add poll completion and post tagging endpoints. Polls: read/retract a vote (`GET`/`DELETE /posts/{postId}/votes/{actorId}`), author voter breakdown (`GET /posts/{postId}/voters`), and enforced `closes_at`. Tagging: `tags` on post create/PATCH, `approve`/`remove` verb routes, `GET /actors/{actorId}/tagged`, plus the `PostTag`, `PollVote`, and `PollVoter` types and the `tag.created` webhook event.

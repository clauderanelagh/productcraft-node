---
"@productcraft/social": minor
---

Sync with the Social API tranche-1 release: Idempotency-Key support on non-idempotent writes (replays return the original response), batched relationship lookup (`GET /actors/{id}/relationships?with=`), viewer post-state hydration (`POST /actors/{id}/post-state`), post reactor list (`GET /posts/{id}/reactions`), bulk actor/follow imports with partial-success envelopes, `?expand=` actor expansion on edge lists, and durable multi-subscriber webhooks (event-type discovery at `GET /v1/webhook-event-types`, per-delivery audit + retries).

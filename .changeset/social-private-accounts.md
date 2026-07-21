---
"@productcraft/social": minor
---

Add private accounts and follow requests. Actors gain `is_private`; `POST /follows` against a private actor returns `{ status: "pending" }` and creates a follow request. New routes: approve/decline (`/follow-requests/{dst}/{src}`) and list incoming (`/actors/{actorId}/follow-requests`). The relationships lookup gains `follow_pending`, plus `edge.follow.requested` / `edge.follow.request_approved` webhook events.

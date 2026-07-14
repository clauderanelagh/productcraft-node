---
'@productcraft/social': minor
---

Spec-truth reconciliation (monorepo task 002): generated types now match the wire exactly.

- `shadow_banned_at/until/reason` removed from customer-lane actor responses (they were moderator-only data leaking cross-scope; the server no longer emits them). The moderation shadow-ban endpoints keep them via the new `ModerationActorResponseDto`.
- Post responses gain `view_count` and `scheduled_for`; status enum now includes `draft` and `scheduled`.
- Comment responses gain `reaction_counts` and the `pending_approval` status; DM responses gain `reaction_counts`.
- Flag create is typed as its real envelope `{ flag, created, auto_hidden }`; act-on-flag as `{ flag, moderation_action }`.
- Notification `kind` enum covers all 12 live kinds (was 5); `target_kind` gains `direct_message`; emitted `suppressed` field typed.
- Error statuses now declared truthfully across posts/edges/flags/moderation (422s, 409s); edge GET lists 404 unknown actors; punitive re-actions on closed flags 409 (`FLAG_ALREADY_CLOSED`).
- Duplicate component schemas resolved (`ErrorResponse`, `CursorPagination`, `FlagResponseDto`, `EdgeResponseDto`, …) — some generated type names changed as a result.

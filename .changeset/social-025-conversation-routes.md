---
"@productcraft/social": minor
---

Social spec refresh — conversation route consolidation (task 025):
`PATCH /conversations/:id/members/:actorId` is now the canonical home
for member state — admins set `role`, the caller sets their own
`muted` / `muted_until` / `pinned` (`UpdateMemberRoleDto` is renamed
`UpdateMemberDto`, with `role` now optional). Conversation-level
`PATCH /conversations/:id` gains `name` for group renames (admin-only,
409 on non-group) and its participant fields plus the old rename route
are marked deprecated — removal tracked for the next minor.

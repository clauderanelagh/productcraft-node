---
"@productcraft/social": patch
---

Social spec refresh — moderation enforcement completeness (task 017):
`GET /v1/communities/{communityId}/flags` (reporter-scoped listing),
`POST /v1/workspaces/{workspaceId}/communities/{communityId}/moderation/actions`
(direct admin-lane action), and `actor` + `direct_message` added to the
flag `target_kind` enum.

---
"@productcraft/social": minor
---

Social spec refresh — DM inbox management (task 024): conversations
carry `unread_count`; participant rows carry `pinned` + `muted_until`
(settable on the conversation PATCH); new
`GET /conversations/{conversationId}/messages/{messageId}`.

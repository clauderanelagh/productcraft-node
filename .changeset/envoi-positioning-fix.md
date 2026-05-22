---
"@productcraft/envoi": patch
"productcraft": patch
---

Rewrite the README + package.json description to match Envoi's actual surface — a receive-and-store mail platform with template-rendered sends, workspace-scoped mailboxes + domains + DKIM, message timeline, suppression lists, and outbound webhooks. The v0.0.3 README documented a fictional `POST /v1/mailboxes/{mailboxId}/messages/send` shape; the live endpoint is `POST /v1/workspaces/{workspace_id}/templates/{name}/send` and is template-rendered with idempotency support. Quick-start + common-operations section now line up with what the live OpenAPI spec actually accepts.

---
"@productcraft/notify": minor
"@productcraft/notify-js": minor
"@productcraft/notify-react": minor
---

Approval requests ("agents propose, humans approve") and the webhook channel:

- `@productcraft/notify`: `notify.approvals.create / list / retrieve / cancel / recordDecision` (ask people a yes/no question on any channel; `wait_seconds` waits for the answer), `notify.client({ token }).approvals.retrieve / decide`, the `approval` config on notification types, the `webhook` channel, and the `approval.resolved` and `notification.webhook` webhook events.
- `@productcraft/notify-js`: `client.approvals.get(id)` and `client.approvals.decide(id, "approve" | "reject", reason?)`.
- `@productcraft/notify-react`: `<NotifyApproval item={item} />` (who asks, a reason box, Approve and Reject, then the outcome), rendered by `<NotifyInbox/>` for approval items; strings in all six locales.

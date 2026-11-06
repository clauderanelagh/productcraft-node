---
"@productcraft/mail": major
---

**@productcraft/mail 1.0: generated resource methods, stable.** Every operation is now a method generated from the Mail OpenAPI spec over the shared `@productcraft/core` runtime:

- `mail.emails.send/batch/list/retrieve/metrics` (the Resend-shaped raw send), `mail.templates.*` including `templates.send(name, { to, data })`, `mail.messages.list/retrieve/timeline/body/export/erase` (the per-recipient delivery log), `mail.domains.*` with `mail.domains.poll(id)`, plus contacts, segments, topics, broadcasts, suppression, mailboxes, received mail, sending defaults, SMTP config, stats and `mail.webhooks.endpoints/events/eventTypes/attempts`.
- `mail.webhooks.unwrap({ payload, headers, secret? })` verifies a delivery against one or several secrets (default, per-domain, endpoint), Standard Webhooks or the older `X-Mail-Signature`, and returns the typed event union (`email.delivered`, `email.bounced`, `domain.verified`, …, then `UnknownWebhookEvent`).
- Auto-pagination (`for await`), automatic `Idempotency-Key` on sends and creates, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes (`NotFoundError`, `BadRequestError` with `errors[]`, `UnprocessableEntityError`, …) carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`. CSV exports, raw MIME and attachments resolve to the raw `Response`.
- `new Mail({ apiKey, workspaceId })`; `@productcraft/mail/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

Not breaking for `.client` users: `mail.client` is still the typed `openapi-fetch` client over the same `paths`. The deprecated default and per-domain webhook routes have no SDK methods (use `.client` or move to `webhooks.endpoints`). Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/mail-1.0.0.md

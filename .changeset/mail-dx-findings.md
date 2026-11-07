---
"@productcraft/core": minor
"@productcraft/mail": minor
"@productcraft/auth": minor
"@productcraft/social": minor
"@productcraft/trawl": minor
"@productcraft/waitlist": minor
"@productcraft/platform-auth": minor
---

App-mail review fixes, all from the spec or the shared runtime:

- **`withResponse().rateLimit` works on every product.** ProductCraft APIs send one set of `X-RateLimit-*` headers per named window (`-short`, one second; `-long`, one minute), which 1.x parsed as nothing. `rateLimit` is now the binding window (fewest left), with `window` naming it and `windows` holding each one. New type `RateLimitWindow`.
- **Mail: a send without content no longer compiles.** `Mail.EmailSendParams` (and each `emails.batch` row) is html with a subject, text with a subject, or a template; `mail.emails.send({ from, to })`, and html together with a template, are type errors instead of a 400 `EMAIL_CONTENT_CONFLICT`. The generated examples in api.md and the README send a body.
- **Model names are nouns.** Mail: `EmailSendResponse` (was `SendEmail`), `EmailBatchResponse` (`SendBatchOpenApi`), `TemplateSendResponse` (`SendAccepted`), `MessageEraseResponse` (`DeleteByRecipient`), `IntegrationList`, `SmtpConfigList`, `TemplateTagList`; every product with webhooks: `WebhookEventTypeList` (was `ListWebhookEventTypes`). The old names stay as deprecated aliases for all of 1.x. Object models are named interfaces, so editors show `Mail.WebhookEndpointWithSecret`, not `components["schemas"]["WebhookEndpointWithSecretDto"]`.
- **Mail: `received.timeline()`** is the daily count of received mail (it never counted sends). `messages.timeline()` and `Mail.MessageTimelineParams` stay as deprecated aliases.
- **Mail: `mailboxes.messages.*(mailboxId, messageId)`** instead of `(id, mid)` (positional names only; calls are unchanged).
- **Every product re-exports the runtime's types**: `import type { Page, PagePromise, APIPromise, RequestOptions, ClientOptions, PollOptions, WithResponse, RateLimitInfo, LastResponse } from "@productcraft/mail"`, and in the namespace (`Mail.Page<Mail.Email>`), so nothing has to import `@productcraft/core`, which strict pnpm and Yarn PnP refuse as a transitive dependency.

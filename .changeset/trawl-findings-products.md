---
"@productcraft/trawl": minor
"@productcraft/mail": minor
"@productcraft/waitlist": minor
"@productcraft/social": minor
"@productcraft/auth": minor
"@productcraft/platform-auth": minor
"productcraft": minor
---

Re-export `PaymentRequiredError` (402). Trawl's `jobs.create` documents `402 TRAWL_CREDITS_EXHAUSTED`, so its JSDoc and api.md error table now list it.

Noun model names from the spec: Trawl's stats are `Trawl.Stats`, `StatsTotals`, `StatsWindowTotals`, `StatsSeries` and `StatsSeriesPoint`; every product's webhook lists and replay are `WebhookEndpointList`, `WebhookEventList` and `WebhookEventReplay`. The former names (`TrawlWorkspaceStats`, `ListWebhookEndpoints`, `ReplayWebhookEvent`, …) stay as deprecated aliases. Examples name their results after the thing (`const webhookEndpoint`, `const stats`), not the response shape.

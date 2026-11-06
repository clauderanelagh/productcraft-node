---
"@productcraft/waitlist": major
---

**@productcraft/waitlist 1.0: generated resource methods, stable.** Every operation is now a method generated from the Waitlist OpenAPI spec over the shared `@productcraft/core` runtime:

- `waitlist.lists.*` for the waitlists themselves (`create`, `list`, `retrieve`, `update`, `updateStatus`, `delete`), `waitlist.lists.entries.*` (`list`, `retrieve`, `update`, `delete`, `bulk`, `count`, `export`, `inviteToApp`), `lists.variants`, `lists.testEntries`, `lists.analytics`, plus `settings`, `stats` and `waitlist.webhooks.endpoints/events/eventTypes`.
- `new Waitlist().public({ workspace, waitlist })`: the keyless, browser-safe scope for signup forms (`entries.create`, `info.retrieve`, `leaderboard.list`). It never sends a credential, even from a keyed client.
- `waitlist.webhooks.unwrap({ payload, headers, secret? })` verifies Standard Webhooks or the older `X-Waitlist-Signature` and returns the typed `entry.created` / `entry.approved` / `entry.rejected` union, then `UnknownWebhookEvent`.
- Auto-pagination (`for await`), automatic `Idempotency-Key` on creates and the public submit, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`. The CSV export resolves to the raw `Response`.
- `@productcraft/waitlist/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

Breaking: a client constructed with a workspace key in a browser now throws `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true` (the keyless client is unaffected). Not breaking for `.client` users: `waitlist.client` is still the typed `openapi-fetch` client over the same `paths`. The deprecated `/webhooks` and `/webhooks/{id}` routes and the bare `/leaderboard` array have no SDK methods (use `.client`, or `webhooks.endpoints` and `public(…).leaderboard.list()`). Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/waitlist-1.0.0.md

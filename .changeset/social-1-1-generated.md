---
"@productcraft/social": minor
---

**@productcraft/social 1.1: generated resource methods with a community scope.** Every operation is now a method generated from the Social OpenAPI spec over the shared `@productcraft/core` runtime. Additive: `social.client` is unchanged and typed by the same `paths`.

- `social.community(communityId)` binds the community for every `/v1/communities/{community_id}/…` route: `actors` (with `feed`, `notifications`, `mutedTerms`, `hashtagFollows`, `followers`, …), `posts` (with `comments`, `reactions`, `tags`, `votes`, …), `follows`, `blocks`, `mutes`, `lists`, `collections`, `conversations` (with `messages`), `hashtags`, `search`, `flags`, `assets` and community `webhooks`.
- `.as(actorId)` on that scope fills `actor_id` in every body or query that declares it, unless the call passes one: `social.community(id).as(actorId).posts.create({ body: "Hello" })`.
- Workspace-level routes stay on the root: `social.communities.*` (with `moderation`, `analytics` and per-community webhooks), `social.webhooks.*`, `social.stats`. The client fills `workspace_id` (`workspaceId` option, `PRODUCTCRAFT_WORKSPACE_ID`, or one lookup for a workspace key).
- Auto-pagination (`for await`), automatic `Idempotency-Key` on writes that declare it, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`, and `webhooks.unwrap()` for typed Social webhook events.
- `@productcraft/social/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

New constructor options: `apiKey`, `workspaceId`, `maxRetries`, `timeout`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`. A client constructed with a key in a browser now throws `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true` (Social is server-side; this stops a workspace key shipping to browsers). Guide with the resource method for every raw call our docs use: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/social-1.1.0.md

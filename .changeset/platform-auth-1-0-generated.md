---
"@productcraft/platform-auth": major
---

**@productcraft/platform-auth 1.0: generated resource methods, stable.** Every operation is now a method generated from the Platform OpenAPI spec over the shared `@productcraft/core` runtime:

- `platform.workspaces.*` (`create`, `list`, `retrieve`, `update`, `delete`) with `members`, `invites`, `roles`, `policies`, `apiKeys` (`create`, `list`, `retrieve`, `update`, `updateBindings`, `rotate`, `preview`, `delete`, `presets`), `services` (`enable`, `disable`, `updateSettings`), `auditLogs`, `auditFeed` and `avatar.upload`; `platform.apiKeys.self()`, `platform.introspect.apiKey()` / `introspect.workspaces.retrieve()`, `platform.me`, `platform.sessions`, `platform.oauth.connections`, `platform.stats` and the public `platform.auth.signin/signup/refresh/password.*` routes.
- Workspace routes take the workspace slug positionally (`platform.workspaces.retrieve("acme")`).
- Avatar uploads take typed form fields (`{ file: File | Blob }`) and send `multipart/form-data`.
- Auto-pagination (`for await`), automatic `Idempotency-Key` on writes that declare it, retries with backoff honouring `Retry-After`, per-attempt timeouts, typed error classes carrying `requestId` and `docUrl`, `lastResponse` and `.withResponse()`.
- `@productcraft/platform-auth/testing` exports `createMockFetch()`; the package ships `api.md` and `manifest.json`.

Breaking: a client constructed with a key or token in a browser now throws `ConfigurationError` unless you pass `dangerouslyAllowBrowser: true`. `platformAuth.client` is still the typed `openapi-fetch` client over the same `paths`; the only `.client` change is that `POST /v1/introspect/api-key` no longer declares an `authorization` header parameter (since 0.2.0), so drop `params: { header: { authorization: "" } }`. Requires Node 20.3+. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/platform-auth-1.0.0.md

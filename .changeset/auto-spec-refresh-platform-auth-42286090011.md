---
"@productcraft/platform-auth": minor
---

Refresh platform-auth OpenAPI types from production (SDK-grade Platform spec, monorepo platform-auth-api/021). Type-level changes that can need a code edit, hence a minor:

- `POST /v1/auth/signin`, `/signup`, `/refresh` responses now type the real sign-in body (`access_token`, `token_type`, `expires_in`, optional `refresh_token`). The spec used to show the OAuth token response by mistake (`scope`, `policy`, `workspace_id` were never returned).
- `GET /v1/workspaces/{workspace_slug}/api-keys` is typed as the paged `{ data, pagination }` envelope only, and the API now serves that envelope to SDK user agents (see `@productcraft/core`'s `.client` User-Agent).
- `session_duration` is `"short" | "long" | number`; path ids (`id`, `role_id`, `policy_id`) are `format: uuid`; `DELETE …/policies/{policy_id}` types `deleted` as `boolean`.
- New: `workspace_id` on `GET /v1/api-keys/self`, `Idempotency-Key` on every create (the key mint answers a replay with `409 PAK_ALREADY_MINTED`), `x-pc-sdk` names, described fields.

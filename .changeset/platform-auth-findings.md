---
"@productcraft/platform-auth": minor
---

Fixes from the Platform SDK review, made in the Platform API's spec (RobertBerglund/monorepo#1134) and the generator:

- `workspaces.apiKeys.create` and `apiKeys.preview` take exactly one of `preset` or `policy_ids`. `{ name }` alone, or both fields, is now a compile error; the API already answered `400 VALIDATION_ERROR` to both, so no working call is affected. The api.md example mints from a preset.
- `include_revoked` on `workspaces.apiKeys.list` is a `boolean` (`{ include_revoked: false }`), like every other flag. The string form `"false"` no longer type-checks; the wire value is unchanged.
- A workspace key calling a workspace route with its own slug now gets `200` or `PermissionDeniedError` (403) instead of `InternalServerError` after three attempts, and another workspace's slug is `403 NOT_A_MEMBER`. Every session-only operation lists `PAK_NOT_PERMITTED` in its JSDoc and api.md.
- `PlatformAuthErrorCode` drops the five `WEBHOOK_*` codes: Platform sends no webhooks. The union stays open.
- README examples call operations with a credential they accept: members are listed with a workspace key, and the idempotency example creates a policy with a person's session. Descriptions no longer point at internal files, and update examples use realistic values instead of `"string"`.

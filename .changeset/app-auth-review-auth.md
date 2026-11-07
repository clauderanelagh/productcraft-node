---
"@productcraft/auth": minor
---

- `auth.webhooks.sign({ payload })`: sign a test event for `webhooks.unwrap` (Stripe's `generateTestHeaderString`).
- Every method's reference entry and JSDoc names the credential its route takes (`workspace_key`, `end_user_token`, `app_api_key`, `m2m_token`), from the Auth spec. The README says which `consumer(slug)` routes take which credential: `consumer(slug).users`, `.roles` and `.permissions` take an app API key or M2M token and refuse a workspace key; it also says when to use them rather than `admin.app(id).endUsers`.
- The quick start turns sign-up on: a new app starts with `signup_enabled: false`.
- `apps.list()` auto-pagination no longer loops (the API now honours `cursor`; the runtime also stops on a repeated cursor).
- Reference examples use the spec's example values instead of `"app"` and `"string"`, and type hovers show `string | null` instead of `Open<string | null>`.

---
"@productcraft/core": minor
---

`PaymentRequiredError` (402) joins the error map, so a 402 such as Trawl's `TRAWL_CREDITS_EXHAUSTED` is `instanceof PaymentRequiredError` instead of a bare `APIError`. It is not retried.

`workspaceId` now takes a workspace slug as well as the UUID (`workspaceId: "testing-environment"`). Workspace routes take the UUID, so the slug is resolved once per process: through platform-auth with the client's own bearer token or cookie, or checked against the key's own workspace for an API key. A value that is neither a UUID nor a slug, or a slug that does not resolve, throws a `ConfigurationError` naming it before the product request is sent, instead of the API's opaque `400 Validation failed (uuid is expected)`.

Error classes keep their names in the built bundles: `err.constructor.name` is `APIError`, not `_APIError`.

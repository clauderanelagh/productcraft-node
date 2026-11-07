---
"@productcraft/core": major
"productcraft": major
---

**Stable 1.0: `@productcraft/core` and the `productcraft` umbrella.** Together with `@productcraft/auth` 1.0 and `@productcraft/auth-passport` 1.0 this completes the move of every ProductCraft package onto one generator and one runtime.

- `productcraft` 1.0 is the 0.4 surface (published only as a `next` preview) made stable: `new ProductCraft({ apiKey, workspaceId })`, one shared config with `overrides.<product>`, `pc.platform` (with `pc.platformAuth` as the same instance), lazily built products, and every error class, `verifyWebhook` and product type namespace re-exported. `pc.auth` is now Auth 1.x. Migration guide: https://github.com/clauderanelagh/productcraft-node/blob/main/docs/migrations/productcraft-1.0.0.md (per product: https://github.com/clauderanelagh/productcraft-node/tree/main/docs/migrations).
- `@productcraft/core` 1.0 declares the shared runtime stable (`APIClient`, retries, typed errors, pagination, polling, webhook verification). Nothing is removed: the 0.x helpers (`makeClient`, `PCAuth`, `PC_BASE_URL`) stay, deprecated. Node 20.3 or later.

From 1.0 on, a spec refresh that only adds operations or optional fields is a minor release; a break is a major with a migration guide.

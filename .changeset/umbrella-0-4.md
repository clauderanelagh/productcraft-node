---
"productcraft": minor
"@productcraft/core": patch
---

**productcraft 0.4: one key, one shared config, every generated product.**

- `new ProductCraft({ apiKey, workspaceId })`: `apiKey` is a shorthand for `auth: { type: "apiKey", key }`; `auth` still takes bearer and cookie credentials. Every option (`workspaceId`, `maxRetries`, `timeout`, `fetch`, `defaultHeaders`, `logLevel`, `logger`, `dangerouslyAllowBrowser`, `webhookSecret`) is shared by all products; `overrides.<product>` merges over it.
- `pc.platform` is the Platform client; `pc.platformAuth` stays as the same instance.
- Products are built on first access, so an app that only uses `pc.mail` never constructs the others. `PRODUCTCRAFT_WORKSPACE_ID` is read once, and without a workspace id every product shares one key lookup.
- Re-exports every error class, `verifyWebhook`, each product's type namespace (`import type { Mail } from "productcraft"`) and its error-code type.

`@productcraft/core`: the per-process workspace lookup cache is shared across duplicate copies of core (two products on different core versions still make one lookup).

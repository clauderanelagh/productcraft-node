---
"@productcraft/heimdall": patch
"@productcraft/agora": patch
"@productcraft/rally": patch
"@productcraft/platform-auth": patch
---

Fix stale product hosts + permission scopes in the published READMEs after
the platform rebrand. The SDK's runtime base URLs (in `@productcraft/core`)
were already retargeted; these are the doc strings that lagged behind:

- **heimdall** — the documented JWT `iss` value and the "generated from"
  spec host now read `https://api.auth.productcraft.co` (was the retired
  `api.heimdall.productcraft.co`). A customer who pinned the old issuer in
  their own verifier would reject otherwise-valid tokens.
- **agora** — spec host is `https://social.productcraft.co` (was `agora.`).
- **rally** — spec host is `https://api.waitlist.productcraft.co` (was
  `api.rally.`).
- **platform-auth** — the IAM policy examples use the rebranded permission
  actions (`heimdall.* → auth.*`, `envoi.* → mail.*`); resource-URN
  namespaces (`pcft:heimdall:` / `pcft:envoi:`) intentionally stay as-is,
  matching what the services still emit.

Docs-only — no runtime or type changes. Package/surface names are unchanged
(the public-API rename is deferred to v1.0).

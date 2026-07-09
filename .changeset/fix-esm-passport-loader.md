---
'@productcraft/auth-passport': patch
---

Fix `createAuthJwtStrategy` throwing "passport-jwt is not installed"
for ESM consumers even when passport-jwt was installed. The lazy
loader used a bare `require()`, which tsup compiles to a throwing stub
in the ESM bundle; it now uses `createRequire(import.meta.url)` (with
tsup `shims: true` so the CJS build keeps working). Inherited from
`@productcraft/heimdall-passport`, where the ESM build had the same
bug since 0.1.0.

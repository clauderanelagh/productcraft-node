---
"@productcraft/core": patch
"@productcraft/auth": patch
"@productcraft/auth-passport": patch
"@productcraft/mail": patch
"@productcraft/waitlist": patch
"@productcraft/social": patch
"@productcraft/trawl": patch
"@productcraft/platform-auth": patch
"productcraft": patch
---

Types now resolve for CommonJS consumers on `moduleResolution: node16`/`nodenext`: each `exports` entry points `require` at the CommonJS declarations (`dist/*.d.cts`) instead of the ESM `.d.ts`, which TypeScript rejected with TS1479. `@productcraft/<product>/testing` now resolves under `moduleResolution: node10` too (a `typesVersions` fallback). `@productcraft/auth` no longer imports jose's ESM-only types in its public declarations; `AuthClaims`, `AuthGetKeyFn` and the JWKS key types are structurally identical and still work with `jose.jwtVerify`. No runtime change.

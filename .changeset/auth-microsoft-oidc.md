---
"@productcraft/auth": minor
---

Sign in with Microsoft and any OpenID Connect provider. The provider config methods accept `microsoft` and `oidc-<key>` ids (the `provider` parameter is now a string; the `OAuthProvider` enum type alias is gone because generic ids cannot be enumerated), `admin.app(id).authConfig.providers.discoverOidc({ issuer })` checks an issuer's discovery document, and `ProviderBlockedReason` gains `discovery_failed`.

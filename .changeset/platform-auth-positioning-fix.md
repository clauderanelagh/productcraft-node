---
"@productcraft/platform-auth": patch
"productcraft": patch
---

Full README audit + rewrite. The v0.0.3 README was a one-paragraph stub; expand to cover the actual API surface — authentication (sign-in / signup / refresh / logout / password reset / verification), introspect (used by every other ProductCraft backend to resolve permissions), workspaces, members + invites, roles, IAM policies + the action catalogue, workspace API keys + bindings, service activation, audit feeds. Adds a "Which SDK do I want?" table up top so callers don't confuse Platform-Auth (your ProductCraft team's account) with Heimdall (the end-users of products you build on top).

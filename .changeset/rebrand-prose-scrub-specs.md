---
'@productcraft/heimdall': patch
'@productcraft/envoi': patch
'@productcraft/agora': patch
'@productcraft/rally': patch
'@productcraft/platform-auth': patch
---

Regenerate all surfaces from the post-rebrand-scrub API specs: every
operation/property description now uses the new product names (Auth,
Mail, Social, Waitlist); stale permission strings in descriptions
corrected to the live catalog (auth.*/mail.*/social.*/waitlist.*).
The Waitlist workspace-settings endpoint is now documented at its
canonical path `/v1/workspaces/{workspace_id}/waitlist/settings`
(the old `/rally/settings` path still works on the wire for existing
clients). No request/response shape, auth, or scope changes.

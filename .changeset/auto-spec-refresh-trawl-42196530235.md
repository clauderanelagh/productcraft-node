---
"@productcraft/trawl": patch
---

Refresh trawl OpenAPI types from production: descriptions on every operation, examples on every parameter and request field, and `GET /workspaces/{workspace_id}/credits` no longer takes a `limit` query (it always returns the 50 newest ledger entries; a `limit` sent anyway is ignored).

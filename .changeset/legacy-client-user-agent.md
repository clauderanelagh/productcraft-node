---
"@productcraft/core": patch
---

The `.client` escape hatch (`makeClient`) now sends `User-Agent: productcraft-node/core@<version> node/<version>` outside the browser, unless you set one, like the generated clients do. Platform's `GET /v1/workspaces/{workspace_slug}/api-keys` answers SDK user agents with the paged `{ data, pagination }` envelope its types describe, also when you pass no `limit`.

---
"@productcraft/trawl": patch
---

`json_schema` on job creation and `json_schema` / `result` on job responses are now typed `Record<string, unknown>` instead of `Record<string, never>`, so a real JSON Schema type-checks without an `as never` cast.

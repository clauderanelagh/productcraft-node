---
"@productcraft/flags": patch
---

When Flags is turned off for the workspace, config delivery now answers `403 SERVICE_NOT_ENABLED`. The client keeps the last config it holds (evaluations report `STALE`) or returns your default values, and logs why: "Flags is turned off for this workspace (403 SERVICE_NOT_ENABLED)".

---
"@productcraft/trawl": patch
---

Fix the public type namespace in the published declarations: `Trawl.Job`, `Trawl.JobCreateParams` and every other `Trawl.*` type resolved to a circular alias in 1.0.0 (TS2456 with `skipLibCheck` off, and an `any`-like type with it on). Method parameters and return types were not affected.

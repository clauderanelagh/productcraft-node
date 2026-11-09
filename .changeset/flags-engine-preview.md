---
"@productcraft/flags-engine": minor
---

New package: the ProductCraft Flags evaluation engine. `parseConfig` reads a Flags config JSON (schema 1) and `evaluate` / `evaluateAll` evaluate feature flags and settings locally and synchronously (targeting rules, segments, prerequisites, percentage splits, confidential comparators), with zero dependencies. Ships its normative `SPEC.md`, the config JSON Schema and the conformance test vectors.

# 016 — `@productcraft/flags-openfeature`: OpenFeature server provider

| Field | Value |
|---|---|
| Title | OpenFeature provider over `FlagsClient` |
| Status | pending |
| Priority | high (Flags program, step 15 of 23) |
| Dependencies | 015 published |
| Summary | Ship `ProductCraftFlagsProvider` for `@openfeature/server-sdk` as its own package (PRD P13), mapping context, reasons, error codes, variants and events. |

## Context

Design 8.3 (`monorepo/internal_docs/flags/design.md`); OpenFeature provider spec (reasons STATIC/DEFAULT/TARGETING_MATCH/SPLIT/CACHED/STALE/ERROR; errors PROVIDER_NOT_READY, FLAG_NOT_FOUND, PARSE_ERROR, TYPE_MISMATCH, TARGETING_KEY_MISSING, INVALID_CONTEXT, GENERAL); `packages/auth-passport` as the packaging pattern (peer dependency, allowlisted).

## Requirements

- `packages/flags-openfeature` public (0.1.0), peer deps `@openfeature/server-sdk` (current major) and `@productcraft/flags` (`^0.1 || ^1`), ESM + CJS.
- `new ProductCraftFlagsProvider({ client } | FlagsClientOptions)`: `metadata.name = 'productcraft-flags'`, `initialize` → `waitForReady`, `onClose` → `close`, boolean/string/number/object resolvers (object parses json settings; non-json → TYPE_MISMATCH), context mapping (`targetingKey` → `identifier`; primitives, Date, string[] → attributes; others dropped with a debug log), `flagMetadata {revision, rule_index, percentage_index}`, `PREREQUISITE_*` → `GENERAL`, events CONFIGURATION_CHANGED / STALE / ERROR.
- README with the OpenFeature snippet; root README and `CLAUDE.md` tables; size budget entry; trusted publisher before release.

## Testing

Vectors through the provider (OpenFeature client in tests), event emission, shutdown leaves no timers, dist smoke, types resolution.

## Definition of Done

- [ ] CI green; merged; published on npm; snippet runs against testing-environment with a throwaway project (deleted).
- [ ] This file deleted in the PR.

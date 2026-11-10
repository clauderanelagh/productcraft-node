# @productcraft/flags

## 0.1.0

### Minor Changes

- 0511b08: New package `@productcraft/flags` (preview): feature flags and remote settings.
  - `FlagsClient` downloads one config per environment and evaluates flags locally with `@productcraft/flags-engine`, so user attributes never leave your app: `getValue`, `getJson<T>`, `getValueDetails`, `getAllValues`, `snapshot()`, `defaultUser` / `setDefaultUser`; auto, lazy and manual polling with ETag reuse; a pluggable cache and `bootstrap` config as fail-safes; overrides from a map, a JSON file or an environment variable; `ready`, `configChanged`, `evaluated` and `error` hooks; it never throws after construction.
  - `Flags`: the generated management API client (projects, configs, environments, flags, targeting, segments, SDK keys, history, webhooks).
  - `@productcraft/flags/testing`: `createTestClient({ values })` for unit tests, plus the generated `createMockFetch()`.
  - `productcraft`: `pc.flags` (the management client).
  - `@productcraft/core`: exports `isBrowser`, `runtimeTag` and `sleep`, and `PC_BASE_URL.flags`.

### Patch Changes

- Updated dependencies [0511b08]
  - @productcraft/core@1.4.0

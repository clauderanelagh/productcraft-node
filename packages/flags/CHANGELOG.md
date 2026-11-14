# @productcraft/flags

## 0.5.0

### Minor Changes

- cb7d320: Fixes from the WriteWave pilot.
  - **Your own user type works without a spread.** Every evaluation method (`getValue`, `getValueDetails`, `getJson`, `getAllValues`, snapshots, `setDefaultUser` / `defaultUser`, `createTestClient`, `useFlag`, the engine's `evaluate`) now takes a `UserInput`: a `User` object literal or a value of your own named interface (`interface AppUser { identifier: string; email?: string }`), which used to fail with TS2345. New exported types `UserAttributes` and `UserInput`; `User` is unchanged.
  - **Missing-attribute warnings log once per attribute.** A soft miss (a rule on an attribute the user does not have, such as `email` for anonymous traffic) was logged on every config revision for every flag; it is now logged once per attribute for the life of the client. `getValueDetails().warnings` still lists every warning; `logger: null` still logs nothing.
  - **List edits in the management client.** `flags.settings.values.update(settingId, environmentId, { version, rule_edits: [{ rule_index, condition_index, values_add, values_remove }] })` adds or removes values in one list condition without re-sending the rules, and `flags.segments.update(segmentId, { version, condition_edits: [...] })` does the same for a segment.
  - README: `baseUrl` (in-cluster, self-hosted or proxied delivery; it stops the client following the config's `delivery.base_urls` hint) and the user section.

### Patch Changes

- Updated dependencies [cb7d320]
  - @productcraft/flags-engine@0.2.0

## 0.4.0

### Minor Changes

- 9640994: Spec refresh. `@productcraft/flags`: every management method now documents `UNAUTHORIZED` (401) and the retryable `MANAGEMENT_UNAVAILABLE` (503, `Retry-After`) errors. Environment, config, setting and segment keys carry their pattern and length limits in the types and docs, and the evaluation warning `iso_date_converted` is now typed. `@productcraft/platform-auth`: the Flags and Notify key presets (`flags`, `flags-dev`, `notify-send`, `notify-readonly`) and the `flags` and `notify` products are now typed.

## 0.3.0

### Minor Changes

- 30d8323: `FlagsClient.state` is now `unavailable`, not `stale`, when a download fails and the client has never held a config (no earlier download, cache or bootstrap). `stale` keeps its meaning: the last download failed and an older config is being served. Evaluations are unchanged (your default, with `PROVIDER_NOT_READY`). If you `switch` on `state`, add a case for `unavailable`. The OpenFeature and React packages accept `@productcraft/flags` 0.3.

## 0.2.0

### Minor Changes

- e87256b: A browser and React Native build of `FlagsClient`: the `browser` and `react-native` export conditions resolve to a build without Node-only code (no `node:` import, no `process.env`). In a page it sends no `If-None-Match` (the browser HTTP cache revalidates, no CORS preflight) and auto polling pauses while the tab is hidden. `overrides.file` and `overrides.env` stay Node-only. A key used in a browser or mobile app makes its whole config public: give client flags their own config with no internal rules.

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

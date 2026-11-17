# @productcraft/flags-react

## 0.1.4

### Patch Changes

- Accept `@productcraft/flags` 0.6 as a peer.
- Updated dependencies [97be777]
  - @productcraft/flags@0.6.0

## 0.1.3

### Patch Changes

- deb7372: Accept `@productcraft/flags` 0.5 as a peer.
- cb7d320: Fixes from the WriteWave pilot.
  - **Your own user type works without a spread.** Every evaluation method (`getValue`, `getValueDetails`, `getJson`, `getAllValues`, snapshots, `setDefaultUser` / `defaultUser`, `createTestClient`, `useFlag`, the engine's `evaluate`) now takes a `UserInput`: a `User` object literal or a value of your own named interface (`interface AppUser { identifier: string; email?: string }`), which used to fail with TS2345. New exported types `UserAttributes` and `UserInput`; `User` is unchanged.
  - **Missing-attribute warnings log once per attribute.** A soft miss (a rule on an attribute the user does not have, such as `email` for anonymous traffic) was logged on every config revision for every flag; it is now logged once per attribute for the life of the client. `getValueDetails().warnings` still lists every warning; `logger: null` still logs nothing.
  - **List edits in the management client.** `flags.settings.values.update(settingId, environmentId, { version, rule_edits: [{ rule_index, condition_index, values_add, values_remove }] })` adds or removes values in one list condition without re-sending the rules, and `flags.segments.update(segmentId, { version, condition_edits: [...] })` does the same for a segment.
  - README: `baseUrl` (in-cluster, self-hosted or proxied delivery; it stops the client following the config's `delivery.base_urls` hint) and the user section.

## 0.1.2

### Patch Changes

- d25ba4a: Accept `@productcraft/flags` 0.4 as a peer.

## 0.1.1

### Patch Changes

- 30d8323: `FlagsClient.state` is now `unavailable`, not `stale`, when a download fails and the client has never held a config (no earlier download, cache or bootstrap). `stale` keeps its meaning: the last download failed and an older config is being served. Evaluations are unchanged (your default, with `PROVIDER_NOT_READY`). If you `switch` on `state`, add a case for `unavailable`. The OpenFeature and React packages accept `@productcraft/flags` 0.3.

## 0.1.0

### Minor Changes

- e87256b: New package: React bindings for ProductCraft Flags. `FlagsProvider` (a `client` or `FlagsClientOptions`, optional `bootstrap` and `user`), `useFlag`, `useFlagDetails`, `useFlagsClient` and `useFlagsReady`, re-rendering on config changes through `useSyncExternalStore`. Server-side rendering: pass `snapshot().toJSON()` from the server as `bootstrap` for a first render with no flash and no hydration mismatch (Next.js App and Pages Router examples in the README).

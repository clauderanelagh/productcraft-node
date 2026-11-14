---
"@productcraft/flags": minor
"@productcraft/flags-engine": minor
"@productcraft/flags-react": patch
---

Fixes from the WriteWave pilot.

- **Your own user type works without a spread.** Every evaluation method (`getValue`, `getValueDetails`, `getJson`, `getAllValues`, snapshots, `setDefaultUser` / `defaultUser`, `createTestClient`, `useFlag`, the engine's `evaluate`) now takes a `UserInput`: a `User` object literal or a value of your own named interface (`interface AppUser { identifier: string; email?: string }`), which used to fail with TS2345. New exported types `UserAttributes` and `UserInput`; `User` is unchanged.
- **Missing-attribute warnings log once per attribute.** A soft miss (a rule on an attribute the user does not have, such as `email` for anonymous traffic) was logged on every config revision for every flag; it is now logged once per attribute for the life of the client. `getValueDetails().warnings` still lists every warning; `logger: null` still logs nothing.
- **List edits in the management client.** `flags.settings.values.update(settingId, environmentId, { version, rule_edits: [{ rule_index, condition_index, values_add, values_remove }] })` adds or removes values in one list condition without re-sending the rules, and `flags.segments.update(segmentId, { version, condition_edits: [...] })` does the same for a segment.
- README: `baseUrl` (in-cluster, self-hosted or proxied delivery; it stops the client following the config's `delivery.base_urls` hint) and the user section.

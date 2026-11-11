# @productcraft/flags-react

## 0.1.1

### Patch Changes

- 30d8323: `FlagsClient.state` is now `unavailable`, not `stale`, when a download fails and the client has never held a config (no earlier download, cache or bootstrap). `stale` keeps its meaning: the last download failed and an older config is being served. Evaluations are unchanged (your default, with `PROVIDER_NOT_READY`). If you `switch` on `state`, add a case for `unavailable`. The OpenFeature and React packages accept `@productcraft/flags` 0.3.

## 0.1.0

### Minor Changes

- e87256b: New package: React bindings for ProductCraft Flags. `FlagsProvider` (a `client` or `FlagsClientOptions`, optional `bootstrap` and `user`), `useFlag`, `useFlagDetails`, `useFlagsClient` and `useFlagsReady`, re-rendering on config changes through `useSyncExternalStore`. Server-side rendering: pass `snapshot().toJSON()` from the server as `bootstrap` for a first render with no flash and no hydration mismatch (Next.js App and Pages Router examples in the README).

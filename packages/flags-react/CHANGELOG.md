# @productcraft/flags-react

## 0.1.0

### Minor Changes

- e87256b: New package: React bindings for ProductCraft Flags. `FlagsProvider` (a `client` or `FlagsClientOptions`, optional `bootstrap` and `user`), `useFlag`, `useFlagDetails`, `useFlagsClient` and `useFlagsReady`, re-rendering on config changes through `useSyncExternalStore`. Server-side rendering: pass `snapshot().toJSON()` from the server as `bootstrap` for a first render with no flash and no hydration mismatch (Next.js App and Pages Router examples in the README).

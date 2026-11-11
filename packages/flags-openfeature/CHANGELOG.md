# @productcraft/flags-openfeature

## 0.1.2

### Patch Changes

- 30d8323: `FlagsClient.state` is now `unavailable`, not `stale`, when a download fails and the client has never held a config (no earlier download, cache or bootstrap). `stale` keeps its meaning: the last download failed and an older config is being served. Evaluations are unchanged (your default, with `PROVIDER_NOT_READY`). If you `switch` on `state`, add a case for `unavailable`. The OpenFeature and React packages accept `@productcraft/flags` 0.3.

## 0.1.1

### Patch Changes

- e87256b: Accepts `@productcraft/flags` 0.2 as a peer.

## 0.1.0

### Minor Changes

- 9d1c5bc: New package: `ProductCraftFlagsProvider`, an OpenFeature server provider for ProductCraft Flags. It wraps `FlagsClient`, so flags are still evaluated locally and the evaluation context never leaves your app. It maps `targetingKey` and context attributes to the Flags user, supports boolean, string, number and object (json) flags, and reports reasons, variants, `flagMetadata` (`revision`, `rule_index`, `percentage_index`) and error codes. It emits `PROVIDER_CONFIGURATION_CHANGED` (with `flagsChanged`), `PROVIDER_STALE`, `PROVIDER_ERROR` and `PROVIDER_READY` on recovery, and closes the client on shutdown.

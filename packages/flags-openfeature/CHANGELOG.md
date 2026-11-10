# @productcraft/flags-openfeature

## 0.1.0

### Minor Changes

- 9d1c5bc: New package: `ProductCraftFlagsProvider`, an OpenFeature server provider for ProductCraft Flags. It wraps `FlagsClient`, so flags are still evaluated locally and the evaluation context never leaves your app. It maps `targetingKey` and context attributes to the Flags user, supports boolean, string, number and object (json) flags, and reports reasons, variants, `flagMetadata` (`revision`, `rule_index`, `percentage_index`) and error codes. It emits `PROVIDER_CONFIGURATION_CHANGED` (with `flagsChanged`), `PROVIDER_STALE`, `PROVIDER_ERROR` and `PROVIDER_READY` on recovery, and closes the client on shutdown.

# @productcraft/flags-openfeature

[OpenFeature](https://openfeature.dev) server provider for [ProductCraft Flags](https://productcraft.co/docs/flags). It wraps [`FlagsClient`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/flags#readme), which downloads one config per environment and evaluates flags **locally**: the evaluation context never leaves your app.

```bash
npm install @openfeature/server-sdk @productcraft/flags @productcraft/flags-openfeature
```

## Usage

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { ProductCraftFlagsProvider } from "@productcraft/flags-openfeature";

// Takes FlagsClient options (polling, cache, bootstrap, overrides, ...) or { client } for a client you built.
await OpenFeature.setProviderAndWait(new ProductCraftFlagsProvider({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY }));

const flags = OpenFeature.getClient();
const user = { id: "user-1", email: "ada@example.com" };
const enabled = await flags.getBooleanValue("new_checkout", false, { targetingKey: user.id, email: user.email, plan: "pro" });
const banner = await flags.getStringValue("banner_text", "Welcome", { targetingKey: user.id });
const limits = await flags.getObjectValue("limits", { max: 5 }, { targetingKey: user.id });

const details = await flags.getBooleanDetails("new_checkout", false, { targetingKey: user.id });
// details.reason: "TARGETING_MATCH", details.variant: "rule:0", details.flagMetadata: { revision: 42, rule_index: 0 }

await OpenFeature.close(); // closes the FlagsClient: no timers left behind
```

## How it maps

| OpenFeature | Flags |
|---|---|
| `targetingKey` | `identifier` (the attribute percentage splits hash) |
| `email`, `country` | the top-level user fields |
| any other string, number, boolean, `Date` or `string[]` | a custom attribute rules can target |
| nested objects, mixed arrays | dropped (logged at debug level) |
| an empty context | the client's `defaultUser` |
| boolean / string / number resolvers | `getValueDetails` with your default (a different setting type is `TYPE_MISMATCH`) |
| object resolver | a `json` setting, parsed; any other setting type is `TYPE_MISMATCH` |
| `reason` | `STATIC`, `TARGETING_MATCH`, `SPLIT`, `DEFAULT`, `CACHED` (served from the cache or `bootstrap` before the first download), `STALE` (the last download failed), `ERROR` |
| `variant` | `rule:<i>`, `rule:<i>/pct:<j>`, `pct:<j>` or `default` |
| `flagMetadata` | `revision`, plus `rule_index` / `percentage_index` when a rule or split decided the value |
| `errorCode` | `FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `PARSE_ERROR`, `PROVIDER_NOT_READY`; prerequisite errors (cycle, missing, too deep) are `GENERAL` |

Evaluations never throw: on any failure you get your default with `reason: "ERROR"`.

## Lifecycle and events

- `initialize` waits for the first download, at most `polling.maxInitWaitSeconds` (default 5). It fails (provider status `ERROR`) only when there is no config at all: no download, no cache, no `bootstrap`. Evaluations then return `PROVIDER_NOT_READY` with your default until a config arrives, which reports `PROVIDER_READY`.
- `PROVIDER_CONFIGURATION_CHANGED` when a new config revision is adopted, with `flagsChanged` (every key when segments changed) and `metadata.revision`.
- `PROVIDER_STALE` when a download fails while an older config is being served; `PROVIDER_READY` after the next successful download.
- `PROVIDER_ERROR` when the SDK key is unknown, revoked or expired (HTTP 404; the held config is still served), or a download fails with no config held.
- Download failures are logged through the provider's `logger` (`console` by default, `null` for none). Log lines never contain the SDK key.
- `onClose` (`OpenFeature.close()` or replacing the provider) closes the `FlagsClient`, including one you passed in.

`provider.client` is the `FlagsClient` underneath, for `forceRefresh()`, `snapshot()` or `getAllValues()`.

## Tests

Use `createTestClient` from `@productcraft/flags/testing`: no network, no timers.

```ts
import { OpenFeature } from "@openfeature/server-sdk";
import { createTestClient } from "@productcraft/flags/testing";
import { ProductCraftFlagsProvider } from "@productcraft/flags-openfeature";

const client = createTestClient({ values: { new_checkout: true } });
await OpenFeature.setProviderAndWait(new ProductCraftFlagsProvider({ client }));
client.set("new_checkout", false); // emits PROVIDER_CONFIGURATION_CHANGED
```

## Requirements

Node.js 20.3+, `@openfeature/server-sdk` 1.17+ and `@productcraft/flags` 0.1+ (peer dependencies). ESM and CommonJS.

MIT licensed.

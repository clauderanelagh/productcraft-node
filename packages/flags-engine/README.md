# @productcraft/flags-engine

The evaluation engine of [ProductCraft Flags](https://productcraft.co): it parses a Flags config JSON and evaluates feature flags and settings **locally**, synchronously, with zero dependencies, no I/O and no timers. User attributes never leave your process.

Most apps use the Flags SDK (`@productcraft/flags`), which downloads the config, keeps it fresh and calls this engine. Use the engine directly when you fetch or cache the config yourself (an edge function, a relay, a test).

```sh
npm install @productcraft/flags-engine
```

```ts
import { evaluate, evaluateAll, parseConfig } from "@productcraft/flags-engine";

declare const body: string; // the text of GET https://api.flags.productcraft.co/v1/configs/{sdk_key}/config.json

const config = parseConfig(body); // throws ConfigParseError (PARSE_ERROR / UNSUPPORTED_SCHEMA): keep your previous config

const checkout = evaluate(config, "new_checkout", false, { identifier: "user-42", email: "ada@acme.com", custom: { plan: "pro" } });
console.log(checkout.value, checkout.reason, checkout.variant); // true "TARGETING_MATCH" "rule:0"

for (const d of evaluateAll(config, { identifier: "user-42" })) console.log(d.key, d.value);
```

`evaluate` never throws for user data or a missing key: on a hard error it returns your default with `reason: "ERROR"` and an `errorCode` (`FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `PREREQUISITE_CYCLE`, `PREREQUISITE_NOT_FOUND`, `PREREQUISITE_DEPTH`). Attributes it cannot use (missing, empty, not parseable for the comparator) make that condition false and are listed in `warnings`.

The user object is `{ identifier?, email?, country?, custom? }`; any other attribute is read from `custom` first, then from the top level, so `{ identifier: "u1", plan: "pro" }` works too. Pass text in Unicode NFC.

## Spec, schema and vectors

- [`SPEC.md`](SPEC.md): the normative evaluation spec (config JSON schema 1, comparators, coercion, hashing, splits, prerequisites).
- [`schema/config.schema.json`](schema/config.schema.json): the JSON Schema of the config, also exported as `@productcraft/flags-engine/schema/config.schema.json`.
- [`vectors/`](vectors/): the conformance test vectors (format 1), exported as `@productcraft/flags-engine/vectors/<file>.json`. Any implementation of the spec should pass them.

Also exported: `bucket(seed, value)` (the percentage bucket, 0-99), `hashConfidential(value, salt, context, slice?)` (the confidential-comparator hash) and `isNewerConfig(held, incoming)` (the revision/generation guard).

MIT licensed.

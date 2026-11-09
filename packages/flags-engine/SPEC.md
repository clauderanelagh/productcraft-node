# ProductCraft Flags: config JSON and evaluation (schema 1, vectors format 1)

This is the normative specification of how a ProductCraft Flags config is read and evaluated. `@productcraft/flags-engine` implements it; every other implementation (another language's SDK, a relay, the API's own validation) must produce the same results. The test vectors in [`vectors/`](vectors/) are part of the specification: an implementation conforms when it passes all of them. Where this text and a vector disagree, report it; the vector is the tie-breaker until the text is fixed.

The key words MUST, MUST NOT and MAY are used as in RFC 2119.

## 1. Config JSON (schema 1)

The SDK downloads one config per (config, environment) from `GET /v1/configs/{sdk_key}/config.json`. The JSON Schema is [`schema/config.schema.json`](schema/config.schema.json).

```json
{
  "schema": 1,
  "revision": 42,
  "generation": 1,
  "published_at": "2026-11-08T14:02:11Z",
  "config_id": "…",
  "environment_id": "…",
  "salt": "c2FsdC1mb3ItdmVjdG9ycw",
  "delivery": { "base_urls": ["https://api.flags.productcraft.co"], "mode": "hint" },
  "segments": {
    "acme_staff": { "seed": "acme_staff_old", "conditions": [{ "user": { "attribute": "email", "comparator": "ends_with_any", "values": ["@acme.com"] } }] }
  },
  "settings": {
    "new_checkout": {
      "type": "boolean",
      "value": false,
      "seed": "checkout_v2",
      "percentage_attribute": "account_id",
      "rules": [
        { "conditions": [{ "segment": { "segment": "acme_staff", "comparator": "in" } }], "serve": true },
        { "conditions": [{ "user": { "attribute": "app_version", "comparator": "semver_gte", "values": ["2.0.0"] } }],
          "percentages": [{ "percentage": 10, "value": true }, { "percentage": 90, "value": false }] },
        { "conditions": [{ "prerequisite": { "setting": "kill_all", "comparator": "eq", "value": false } }], "serve": true }
      ],
      "percentages": [{ "percentage": 50, "value": true }, { "percentage": 50, "value": false }]
    },
    "kill_all": { "type": "boolean", "value": false },
    "limits": { "type": "json", "value": "{\"max\":5}" }
  }
}
```

### 1.1 Fields

| Field | Rule |
|---|---|
| `schema` | Integer. Any value other than `1` is `UNSUPPORTED_SCHEMA`; a missing or non-integer value is `PARSE_ERROR`. |
| `revision` | Safe integer ≥ 0. Monotonic per (config, environment) within a generation. |
| `generation` | Safe integer ≥ 1. Bumped only after a database restore (section 8). |
| `salt` | String (may be empty). Used by confidential comparators. |
| `published_at`, `config_id`, `environment_id` | Optional strings (or null). Informational. |
| `delivery` | Optional object: `base_urls` (array of strings, a hint) and `mode` (string, default `"hint"`). An SDK MUST keep only `https://*.productcraft.co` origins with no userinfo, port or path, and drop anything else with a warning. |
| `segments` | Optional object, key → segment. Default `{}`. |
| `settings` | Required object, key → setting. |

A **setting** has `type` (`boolean`, `string`, `integer`, `number`, `json`), `value` (the setting's own value), and optionally `seed` (string, default: the key), `percentage_attribute` (non-empty string, default `"identifier"`), `rules` (array, default `[]`) and `percentages` (array or null). A **rule** has `conditions` (array) and exactly one of `serve` (a value) and `percentages`. **Percentages** are a non-empty array of `{percentage, value}` with integer percentages from 0 to 100 that add up to exactly 100.

A value matches its setting type when: `boolean` is a JSON boolean; `string` is a string; `integer` is a safe integer (|n| ≤ 2^53 − 1); `number` is a finite number; `json` is a string holding valid JSON text. The setting's `value`, every `serve` and every percentage option's `value` MUST match.

A **segment** has `conditions` (user conditions only) and optionally `seed` (default: the segment key). Segments cannot reference segments or prerequisites, so segments cannot form cycles.

A **condition** is an object with exactly one of:

- `user`: `{attribute, comparator, values}`. `attribute` is a non-empty string, `values` a non-empty array. For a known comparator the values MUST have the shape of section 4 (arity, strings, finite numbers, valid SemVer, lowercase hex hashes). An **unknown comparator is not a parse error**: its values are not checked and the condition is a soft miss at evaluation, so new comparators are additive.
- `segment`: `{segment, comparator}`. `segment` MUST name a segment of the same config (else `PARSE_ERROR`). `comparator` is `in` or `not_in`; any other string is a soft miss.
- `prerequisite`: `{setting, comparator, value}`. `value` is a boolean, string or number. `comparator` is `eq` or `neq`; any other string is a soft miss. A `setting` missing from the config is **not** a parse error; it is a hard error when evaluated (section 3).

Unknown fields anywhere are ignored. Every rule above that fails is a `PARSE_ERROR` naming the path (`settings.new_checkout.rules[1].percentages`). A client that cannot parse a new body MUST keep its previous config.

### 1.2 Prototype safety

Setting, segment and attribute names are arbitrary strings. `__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf` and every other name MUST behave as ordinary keys: implementations store settings and segments in maps (or null-prototype objects), read only **own** properties of config and user objects, and treat `__proto__` in a JSON body as an ordinary key.

## 2. The user object

```ts
{ identifier?: string, email?: string, country?: string, custom?: { [attribute]: value }, [attribute]: value }
```

ConfigCat's shape, with flat attributes accepted too (`{ identifier: "u1", plan: "pro" }`). The value of attribute `a` for a condition or a split is:

1. `identifier`, `email` and `country`: the top-level own property only.
2. Any other `a`: `custom[a]` when `custom` is an object with an own property `a`; otherwise the top-level own property `a`. (When both exist, `custom` wins.)

A value that is `undefined`, `null` or the empty string `""` is **missing**. The user object never leaves the process.

## 3. Outcomes and algorithm

- **Match:** a rule or a split decided the value.
- **Soft miss:** the user data cannot be evaluated for a condition: no user object (`missing_user`), a missing attribute (`missing_attribute`), an attribute that cannot be coerced for the comparator (`invalid_attribute`), or an unknown comparator (`unknown_comparator`). The condition is **false**, negated comparators included; a warning is recorded; evaluation continues.
- **Hard error:** the config cannot answer for this key: `FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `PREREQUISITE_CYCLE`, `PREREQUISITE_NOT_FOUND`, `PREREQUISITE_DEPTH`. The caller's default is returned with reason `ERROR`.

`evaluate(config, key, default, user)`:

1. No setting `key` → `ERROR` / `FLAG_NOT_FOUND`. A default that is not null/undefined and whose JS type differs from the setting's → `ERROR` / `TYPE_MISMATCH` (`boolean` ↔ boolean; `string` and `json` ↔ string; `integer` and `number` ↔ number, so an integer setting accepts any number default and a number setting accepts integers).
2. Rules in order. A rule's conditions are ANDed left to right and stop at the first condition that is false or a soft miss (later conditions are not evaluated and record nothing). The first rule whose conditions are all true wins: `serve` → reason `TARGETING_MATCH`, variant `rule:i`; `percentages` → the split of section 5: reason `SPLIT`, variant `rule:i/pct:j`. If the split is skipped (missing percentage attribute), the rule does not win and the next rule is tried.
3. The setting's own `percentages`, if any → `SPLIT`, variant `pct:j`; skipped when the percentage attribute is missing.
4. The setting's `value`, variant `default`: reason `STATIC` when the setting has no rules and no percentages, else `DEFAULT`.

`isDefaultValue` is true only for `ERROR`. Indexes are 0-based. An empty `conditions` array is true.

**Segment conditions:** the segment's conditions are evaluated as one AND (stopping at the first false or soft miss), with the segment's seed as the hashing context. `in` is true when they are all true; `not_in` when one is false. A soft miss inside the segment propagates: neither `in` nor `not_in` matches.

**Prerequisite conditions:** the named setting is evaluated completely (rules, splits, its own prerequisites) for the same user, and its value is compared with `value` by strict equality (`eq`) or inequality (`neq`). Within one top-level evaluation each prerequisite's value is memoised. Checks, in this order, each time a prerequisite is entered:

1. not in the config → `PREREQUISITE_NOT_FOUND`;
2. already on the evaluation stack → `PREREQUISITE_CYCLE` (a self-reference included);
3. more than **16** prerequisite hops below the top-level key → `PREREQUISITE_DEPTH`. The check depends only on the path, never on the memo.

A hard error anywhere in the chain makes the top-level evaluation `ERROR` with that code. Warnings recorded inside a prerequisite are reported with the prerequisite's key.

`evaluateAll(config, user)` evaluates every key in config order with a null default (no type check); each key is a separate top-level evaluation.

## 4. Comparators

Case-sensitive, compared by UTF-16 code unit / UTF-8 byte, no Unicode normalisation, no trimming except where stated. Each positive comparator has a negated form that is true exactly when the positive one is false **and the attribute could be evaluated**.

| Family | Comparators | Values | True when |
|---|---|---|---|
| Text | `eq` / `neq` | one string | text = value |
| | `one_of` / `not_one_of` | strings | text is one of the values |
| | `contains_any` / `not_contains_any` | strings | text contains any value |
| | `starts_with_any` / `not_starts_with_any` | strings | text starts with any value |
| | `ends_with_any` / `not_ends_with_any` | strings | text ends with any value |
| Confidential | `eq_hashed` / `neq_hashed` | one hash | `H(text)` = value |
| | `one_of_hashed` / `not_one_of_hashed` | hashes | `H(text)` is one of the values |
| | `starts_with_any_hashed` / `not_starts_with_any_hashed` | `"<n>_<hash>"` | for some value, text has ≥ n UTF-8 bytes and `H(first n bytes)` = hash |
| | `ends_with_any_hashed` / `not_ends_with_any_hashed` | `"<n>_<hash>"` | same with the last n bytes |
| | `array_contains_any_hashed` / `array_not_contains_any_hashed` | hashes | `H(element)` is one of the values for some array element |
| SemVer | `semver_one_of` / `semver_not_one_of` | SemVer strings | the version has equal precedence to any value |
| | `semver_lt`, `semver_lte`, `semver_gt`, `semver_gte` | one SemVer string | precedence comparison |
| Number | `num_eq`, `num_neq`, `num_lt`, `num_lte`, `num_gt`, `num_gte` | one finite number | IEEE double comparison |
| Date | `before`, `after` | one finite number (unix seconds) | attribute < value / attribute > value |
| Array | `array_contains_any` / `array_not_contains_any` | strings | some array element is one of the values |

A hash is 64 lowercase hex characters (`[0-9a-f]{64}`); a sliced hash is `n_` + hash with `n` a positive integer. `H` is defined in section 6. Not in schema 1: regex, case-insensitive comparison, CIDR.

### 4.1 Coercion

| To | From |
|---|---|
| **Text** | string as is; number by ECMAScript `Number::toString` (`1` → `"1"`, `1.5` → `"1.5"`, `1e21` → `"1e+21"`, `-0` → `"0"`); boolean → `"true"` / `"false"`; Date → unix seconds as a number converted to text (`"1762560000.5"`); `string[]` → compact JSON (`["a","b"]` → `'["a","b"]'`). Anything else is invalid. `identifier` and the percentage attribute are text. |
| **Number** | finite number; string: trimmed, the first `,` replaced by `.`, then it MUST match `^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$` and give a finite double. `NaN`, `Infinity`, hex, booleans and arrays are invalid. |
| **Date** (unix seconds, fractional allowed) | a valid Date (ms / 1000), or a Number as above. ISO 8601 strings are invalid in schema 1. |
| **Array** | `string[]`, or a string holding a JSON array of strings. |
| **SemVer** | a string, trimmed, matching SemVer 2.0.0 exactly (no leading `v`, no leading zeros in numeric parts). Build metadata is ignored for comparison; precedence follows SemVer 2.0.0 section 11 (a prerelease is lower than its release; numeric identifiers compare numerically with no size limit and are lower than alphanumeric ones; a longer identifier list is higher when the prefix is equal). |

An attribute that cannot be coerced is a soft miss `invalid_attribute`.

## 5. Percentage splits

The split attribute is `percentage_attribute` (default `identifier`), read as in section 2 and coerced to text. When it is missing, empty or not coercible, the split is **skipped** with warning `missing_percentage_attribute` (no bucket: anonymous users never pile into one option).

```
bucket = parseInt(hex(sha1(utf8(seed + text)))[0:7], 16) % 100
```

`seed` is the setting's seed (the key at creation, frozen, so renaming a key never reshuffles users). The chosen option is the first `j` with `bucket < percentage_0 + … + percentage_j`, so a 0% option is never chosen and buckets 0 to 99 always land somewhere. Rule-level and setting-level splits of one setting use the same hash, so a user's option is sticky and correlated across them.

There is no Unicode normalisation: the NFC and NFD forms of the same text bucket (and hash) differently. Pass NFC (`value.normalize("NFC")`).

## 6. Confidential hashing

```
H(v) = hex(sha256(utf8(v) || utf8(salt + context)))
```

`salt` is the config's `salt` (per project). `context` is the seed of the setting that owns the rule, or of the segment for segment conditions. Sliced (starts/ends with) hashes hash only the first or last `n` UTF-8 bytes of the value and are written `"<n>_" + H`. Hashing is obfuscation, not secrecy: the salt ships in the same JSON, short or guessable values can be brute-forced, and sliced hashes reveal `n`.

## 7. Evaluation details

`{key, value, variant, reason, errorCode, errorMessage, ruleIndex, percentageIndex, isDefaultValue, revision, warnings}` (snake_case on any wire). `reason` is `STATIC | TARGETING_MATCH | SPLIT | DEFAULT | ERROR` (the client layer adds `CACHED`, `STALE`). Error codes from the engine: `FLAG_NOT_FOUND`, `TYPE_MISMATCH`, `PREREQUISITE_CYCLE`, `PREREQUISITE_NOT_FOUND`, `PREREQUISITE_DEPTH`, `GENERAL`; the client adds `PARSE_ERROR`, `PROVIDER_NOT_READY`. `variant` is `rule:i`, `rule:i/pct:j`, `pct:j` or `default` (null on `ERROR`). Each warning is `{code, message, key, ruleIndex, attribute}` with `code` one of `missing_user`, `missing_attribute`, `invalid_attribute`, `unknown_comparator`, `missing_percentage_attribute`; clients log each (key, code) once per revision. Messages are not part of the contract.

## 8. Revisions and generations

A client holding config `(revision r, generation g)` replaces it with a fetched `(r', g')` when `g' ≠ g` (a database restore lowers revisions and bumps the generation) or `r' > r`. A lower or equal revision within the same generation is ignored. A body over 2 MiB is rejected before parsing; an unparsable body keeps the held config.

## 9. Test vectors (format 1)

`vectors/*.json`, each `{format: 1, engine_schema: 1, description, hash?, suites?, invalid_configs?, client?}`:

- `hash.bucket[]` `{seed, value, expect}`; `hash.distribution[]` `{seed, values: {prefix, from, to}, below, expect_count}` (count of `prefix + i` for `i` in `from..to` whose bucket is below `below`); `hash.confidential[]` `{value, salt, context, slice?, bytes?, expect}` (`slice` is `start` or `end`).
- `suites[]` `{name, config | config_ref, cases[]}`; `config_ref` is a path relative to `vectors/`. A case is `{name, key, default, user, expect}` with `user` null or an object, and `expect` a subset of `{value, reason, variant, rule_index, percentage_index, error_code, is_default_value, warnings}` (`warnings` is the ordered list of codes). Fields not present are not asserted. Typed values in `user` and `default`: `{"$date": ISO 8601}` is a Date, `{"$int": "text"}` is the JS number `Number(text)` (for `-0` and exponents that JSON tools normalise). Parse user objects with a JSON parser that keeps `__proto__` as an own key.
- `invalid_configs[]` `{name, body, expect_error}`: a string `body` is the raw response text, an object is serialised first; `expect_error` is `PARSE_ERROR` or `UNSUPPORTED_SCHEMA`.
- `client[]` (SDKs only): `{name, steps[]}`, each step `{request, response, expect}`: the `If-None-Match` the SDK sends, the server's response (`status`, `headers`, `body` or `body_size` for a generated body of that many bytes), and what the SDK holds afterwards (`held`, `accepted`, and where relevant `state`, `error`, `next_poll_at_least_s`, `base_urls`, `warnings`).

Files: `hash.json`, `comparators.json` (every comparator, soft miss and coercion row), `evaluation.json` (the algorithm, user shape, splits, segments, prerequisites, prototype names), `invalid-configs.json`, `renderer.json` (configs rendered by flags-api, end to end), `client.json`.

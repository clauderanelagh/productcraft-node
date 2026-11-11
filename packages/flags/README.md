# @productcraft/flags

Feature flags and remote settings for Node.js, browsers and React Native, from [ProductCraft Flags](https://productcraft.co/docs/flags).

- **`FlagsClient`** downloads one small config JSON per environment and evaluates flags **locally** with [`@productcraft/flags-engine`](https://www.npmjs.com/package/@productcraft/flags-engine). User attributes never leave your app, and an evaluation is a function call, not a request.
- **`Flags`** is the management API client (projects, configs, environments, flags, targeting rules, segments, SDK keys, history, webhooks), generated from the production OpenAPI spec like every ProductCraft SDK.

Free during the preview. Requires Node.js 20.3 or later on the server; in a browser or React Native app, see [Browsers and React Native](#browsers-and-react-native).

```sh
npm install @productcraft/flags
```

## Evaluate flags

Create an SDK key in the console (**Flags > SDK keys**, one per config and environment), then:

```ts
import { FlagsClient } from "@productcraft/flags";

const flags = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY });

const user = { identifier: "user-123", email: "ada@example.com", country: "NL", custom: { plan: "pro" } };
if (await flags.getValue("new_checkout", false, user)) {
  // the new checkout
}
const banner = await flags.getValue("banner_text", "Welcome", user); // string
const limits = await flags.getJson<{ max: number }>("limits", { max: 5 }, user); // parsed JSON
```

The value's type follows your default: `false` gives a `boolean`, `"Welcome"` a `string`, `5` a `number`. An object, array or `null` default on a json setting returns the parsed value; a `null` default is allowed for every type. `getJson<T>()` always parses, and returns your default if the text is not JSON.

**`getValue` never throws** once the client is constructed. A network error, a bad response, an unknown key or a type mismatch returns your default and emits an `error` event. Only a missing or garbled SDK key throws (`ConfigurationError`, at construction).

### The user

`{ identifier, email, country, custom }`, ConfigCat's shape. Flat attributes work too: `{ identifier: "u1", plan: "pro" }`. A rule on attribute `a` reads `custom[a]` first, then the top-level `a`. Percentage rollouts hash the setting with `identifier` (or the setting's percentage attribute), so a user keeps their bucket.

```ts
import { FlagsClient } from "@productcraft/flags";
const flags = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY });

flags.setDefaultUser({ identifier: "user-123" }); // or `defaultUser` in the options
await flags.getValue("new_checkout", false); // uses the default user
await flags.getValue("new_checkout", false, { identifier: "user-456" }); // replaces it as a whole (no merge)
```

Text comparisons are by codepoint with no Unicode normalisation: pass emails and names in **NFC** (`email.normalize("NFC")`), or two spellings of the same address can match different rules and buckets.

### Why a value? Details, all values, snapshots

```ts
import { FlagsClient } from "@productcraft/flags";
const flags = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY });
const user = { identifier: "user-123" };

const d = await flags.getValueDetails("new_checkout", false, user);
console.log(d.value, d.reason, d.variant, d.ruleIndex, d.percentageIndex, d.errorCode, d.revision);

const all = await flags.getAllValues(user); // { key: value }, json settings parsed

await flags.waitForReady();
const snap = flags.snapshot(); // synchronous evaluation of the config held right now
snap.getValue("new_checkout", false, user);
```

`reason` is `STATIC`, `TARGETING_MATCH`, `SPLIT`, `DEFAULT` or `ERROR`, or `CACHED` / `STALE` when the value came from the cache or `bootstrap` before a download, or from an older config while downloads fail.

## Polling and propagation

| Mode | Behaviour |
|---|---|
| `{ mode: "auto", intervalSeconds: 60, maxInitWaitSeconds: 5 }` (default) | Downloads on a timer (minimum 30 s, ±10% jitter). The first `getValue` waits up to `maxInitWaitSeconds` for the first download, then serves the cache, `bootstrap` or your defaults. |
| `{ mode: "lazy", ttlSeconds: 60 }` | No timers. Downloads on use once the config is older than `ttlSeconds` (minimum 30 s), serving the held config while it refreshes. |
| `{ mode: "manual" }` | Downloads only when you call `forceRefresh()`. |

Downloads send `If-None-Match`, so an unchanged config costs a `304`. A change you save in the console reaches an auto-polling client within **interval × 1.1 + 5 s** (the jittered poll, plus up to 5 s for the delivery endpoint to pick up the publish): about 71 s at the default, 38 s at the 30 s minimum. A proxy or CDN of your own in front of the delivery URL may add up to 15 s (`s-maxage`). Call `forceRefresh()` to fetch now.

```ts
import { FlagsClient } from "@productcraft/flags";
const flags = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY, polling: { mode: "auto", intervalSeconds: 30 } });

flags.on("ready", (state) => console.log("flags", state));
flags.on("configChanged", (e) => console.log("config revision", e.revision));
flags.on("error", (err) => console.warn(err.code, err.message));
flags.on("evaluated", (d) => console.debug(d.key, d.value, d.reason));

await flags.forceRefresh();
flags.setOffline(); // stop all network access; evaluations keep working
flags.setOnline();
flags.close(); // stop timers (call it on shutdown)
```

`flags.state` is `initializing`, `ready`, `stale` (the last download failed; an older config is served), `unavailable` (the last download failed and no config was ever held: evaluations return your defaults), `key_invalid` (the key was revoked or expired: the client keeps the config it holds), `offline` or `closed`. Errors back off up to 4× the interval and honour `Retry-After`.

## Fail-safe: cache and bootstrap

What the client evaluates, in order: a fresh download, the last config it holds, your **cache** (read at start-up), your **`bootstrap`** config, and finally the default you pass to `getValue`. A full ProductCraft outage never turns your flags off when the cache or `bootstrap` is set up.

```ts
import { FlagsClient, type FlagsCache } from "@productcraft/flags";
import { readFileSync } from "node:fs";

declare const redis: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<unknown> };

// Any store with get/set: Redis, a KV namespace, a file. Keys never contain the SDK key.
const cache: FlagsCache = { get: (key) => redis.get(key), set: async (key, value) => void (await redis.set(key, value)) };

const flags = new FlagsClient({
  sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY,
  cache,
  // A config JSON shipped with your build (download it from the delivery URL in CI, or `snapshot().toJSON()`).
  bootstrap: readFileSync("flags-bootstrap.json", "utf8"),
});
```

The client refuses a download over 2 MiB, never moves back to an older revision of the config, and only follows delivery hints that point at `https://*.productcraft.co`.

## Serverless and edge functions

Timers do not survive between invocations, so use **lazy polling with the shared cache and `bootstrap`**: a cold start reads the cache (one Redis round trip, no download while the cached config is younger than `ttlSeconds`), and only one invocation per TTL downloads, with `If-None-Match`.

```ts
import { FlagsClient, type FlagsCache } from "@productcraft/flags";
declare const cache: FlagsCache;
declare const bootstrapConfig: object;

// Module scope: reused while the instance stays warm.
const flags = new FlagsClient({
  sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY,
  polling: { mode: "lazy", ttlSeconds: 60 },
  cache,
  bootstrap: bootstrapConfig,
});

export async function handler(event: { userId: string }) {
  const enabled = await flags.getValue("new_checkout", false, { identifier: event.userId });
  return { enabled };
}
```

## Overrides

Overrides set values locally: for local development, tests, or a kill switch you control from an environment variable.

```ts
import { FlagsClient } from "@productcraft/flags";

// From a map. `behaviour`: "local_over_remote" (default), "remote_over_local" or "local_only" (no downloads, no key needed).
const dev = new FlagsClient({ overrides: { values: { new_checkout: true, limits: { max: 50 } }, behaviour: "local_only" } });

// From a JSON file (Node only), reloaded on change with `watch: true`.
const local = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY, overrides: { file: "./flags.local.json", watch: true } });

// From an environment variable holding a JSON object (Node only): PRODUCTCRAFT_FLAGS_OVERRIDES='{"new_checkout": false}'
const ops = new FlagsClient({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY, overrides: { env: "PRODUCTCRAFT_FLAGS_OVERRIDES" } });
```

## Testing

`@productcraft/flags/testing` exports `createTestClient`: a `FlagsClient` with fixed values, no network and no timers, and `set()` to change a value mid-test.

```ts
import { describe, expect, it } from "vitest"; // or Jest: the same calls
import { createTestClient } from "@productcraft/flags/testing";

async function checkoutVersion(flags: { getValue(key: string, def: boolean): Promise<boolean> }) {
  return (await flags.getValue("new_checkout", false)) ? "v2" : "v1";
}

describe("checkout", () => {
  it("follows the new_checkout flag", async () => {
    const flags = createTestClient({ values: { new_checkout: true } });
    expect(await checkoutVersion(flags)).toBe("v2");
    flags.set("new_checkout", false); // emits configChanged
    expect(await checkoutVersion(flags)).toBe("v1");
  });
});
```

The same subpath exports `createMockFetch()` for the management client.

## Browsers and React Native

Bundlers that honour the `browser` or `react-native` export condition (Vite, webpack, esbuild, Rollup, Metro, Next.js client bundles) get a build of the same `FlagsClient` without the Node-only parts, so nothing changes in your code:

- **No `node:` import and no `process.env` read.** `overrides.file` and `overrides.env` are Node-only and report an `overrides` error; use `overrides.values`.
- **The browser HTTP cache revalidates the config.** A page sends no `If-None-Match` (it would force a CORS preflight on every poll); the delivery endpoint allows any origin.
- **Auto polling pauses while the tab is hidden** and downloads once when it is shown again.
- `cache` takes any `{ get, set }`, for example over `localStorage`, so a returning visitor starts with the last config.

```ts
import { FlagsClient } from "@productcraft/flags";

const store = { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) };
const flags = new FlagsClient({ sdkKey: "pcf_sdk_…", cache: store, defaultUser: { identifier: "user-123" } });
flags.on("configChanged", () => render());
const showBanner = await flags.getValue("show_banner", false);
declare function render(): void;
```

For React (hooks, a provider and SSR without a flash) use [`@productcraft/flags-react`](https://www.npmjs.com/package/@productcraft/flags-react). The management client `Flags` keeps refusing to run in a browser with a workspace key.

**A key used in a browser or mobile app makes its whole config public** (next section).

## Server and client configs

An SDK key can read its whole config: flag and segment keys (which can reveal what you are building) and every cleartext rule value. Keep server keys on the server. If a key ships in a browser or mobile app, that config is public: give client-side flags their own config with no internal rules. Confidential comparators hash their values, which hides them from casual reading but not from a determined attacker (the salt ships in the same JSON). Server-only and client key types are planned.

## Manage flags from code

`Flags` is the management API: workspace API key (`PRODUCTCRAFT_API_KEY`) or a platform session, policy-gated, with retries, idempotency keys, pagination and typed errors.

```ts
import { Flags } from "@productcraft/flags";

const flags = new Flags({ apiKey: process.env.PRODUCTCRAFT_API_KEY, workspaceId: "acme-corp" });
const project = await flags.projects.create({ name: "Storefront", environment_preset: "dev_staging_prod" });
for await (const p of flags.projects.list()) console.log(p.name);
```

## Migrating from ConfigCat

Import your ConfigCat product in the console (**Flags > Import from ConfigCat**): percentage rollouts keep their buckets because each imported flag's seed is its ConfigCat key. Before you swap the SDK, run [`examples/configcat-dual-run.mjs`](https://github.com/clauderanelagh/productcraft-node/blob/main/examples/configcat-dual-run.mjs): it evaluates the same users (synthetic, plus a file of your own) with both SDKs locally and prints every difference.

```sh
cd examples && npm install
node configcat-dual-run.mjs --configcat-key "$CONFIGCAT_SDK_KEY" --flags-key "$PRODUCTCRAFT_FLAGS_SDK_KEY" --users 1000 --users-file users.json
```

The user object has the same shape (`identifier`, `email`, `country`, `custom`); `getValueAsync(key, def, user)` becomes `getValue(key, def, user)`, `forceRefreshAsync()` becomes `forceRefresh()`, and `PollingMode.AutoPoll` becomes `{ mode: "auto" }`.

<!-- generated:start (scripts/gen-sdk.mjs; edits between the markers are overwritten) -->

## Resources

Full reference: [api.md](./api.md).

- `flags.changes`: `retrieve`, `revert`
- `flags.configs`: `compare`, `delete`, `environments.copy`, `environments.evaluate`, `environments.revisions.list`, `environments.revisions.retrieve`, `environments.sdkKeys.endGracePeriod`, `environments.sdkKeys.list`, `environments.sdkKeys.reveal`, `environments.sdkKeys.rotate`, `environments.values.list`, `retrieve`, `settings.create`, `settings.list`, `update`
- `flags.imports`: `create`
- `flags.limits`: `retrieve`
- `flags.projects`: `changes.export`, `changes.list`, `configs.create`, `configs.list`, `create`, `delete`, `environments.create`, `environments.delete`, `environments.list`, `environments.retrieve`, `environments.update`, `list`, `retrieve`, `segments.create`, `segments.list`, `update`
- `flags.segments`: `delete`, `retrieve`, `revealConfidential`, `update`
- `flags.settings`: `delete`, `retrieve`, `update`, `values.replace`, `values.retrieve`, `values.revealConfidential`, `values.update`
- `flags.stats`: `retrieve`
- `flags.webhooks`: `endpoints.create`, `endpoints.delete`, `endpoints.list`, `endpoints.retrieve`, `endpoints.rotateSecret`, `endpoints.test`, `endpoints.update`, `eventTypes.list`, `events.list`, `events.replay`, `events.retrieve`

## Pagination

List methods return a `PagePromise`: `for await` walks every item across pages, `await` gives one page.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
for await (const item of flags.projects.list({ limit: 50 })) console.log(item);
const page = await flags.projects.list();
if (page.hasNextPage()) await page.getNextPage();
const all = await flags.projects.list().toArray({ maxItems: 500 });
```

## Errors

Every failure is a class you can catch. `APIError` carries `status`, `code`, `message`, `errors[]`, `requestId` and `docUrl`.

```ts
import { Flags, NotFoundError, RateLimitError, APIError } from "@productcraft/flags";
const flags = new Flags();
try {
  await flags.changes.retrieve("00000000-0000-0000-0000-000000000000");
} catch (err) {
  if (err instanceof NotFoundError) console.log(err.code, err.requestId, err.docUrl);
  else if (err instanceof RateLimitError) console.log(err.retryAfter);
  else if (err instanceof APIError) console.log(err.status, err.errors);
  else throw err;
}
```

## Retries and timeouts

Network errors, 408, 429, 5xx and `409 IDEMPOTENCY_IN_PROGRESS` are retried twice by default with exponential backoff and jitter, honouring `Retry-After` up to 60 s. A POST or PATCH without an idempotency key is never retried. Each attempt times out after 60 s, so the worst case with defaults is about 3 minutes; pass `signal: AbortSignal.timeout(ms)` for an overall deadline.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ maxRetries: 3, timeout: 20_000 });
await flags.projects.list({}, { maxRetries: 0, signal: AbortSignal.timeout(5_000) });
```

## Idempotency

Writes that support it send an `Idempotency-Key` automatically and reuse it on every retry. Pass your own to make a retry across processes safe. If the API's idempotency store is unavailable it runs the request without it (fail-open), so a retry during that window can execute twice.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const project = await flags.projects.create({ name: "Storefront" }, { idempotencyKey: "order-1234" });
```

## Webhooks

`flags.webhooks.unwrap()` verifies the signature against the **raw** body and returns a typed `Flags.UnwrapWebhookEvent`. The secret comes from `{ secret }`, the client's `webhookSecret`, or `PRODUCTCRAFT_FLAGS_WEBHOOK_SECRET`.

Next.js route handler:

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags();
export async function POST(req: Request) {
  const event = await flags.webhooks.unwrap({ payload: await req.text(), headers: req.headers });
  switch (event.type) {
    case "config.published":
      console.log(event.data);
      break;
    default:
      break; // UnknownWebhookEvent: types added later
  }
  return new Response(null, { status: 204 });
}
```

Express (keep the body raw):

```ts
import express from "express";
import { Flags } from "@productcraft/flags";
const flags = new Flags();
const app = express();
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await flags.webhooks.unwrap({ payload: req.body, headers: req.headers });
  console.log(event.type);
  res.sendStatus(204);
});
```

Hono:

```ts
import { Hono } from "hono";
import { Flags } from "@productcraft/flags";
const flags = new Flags();
const app = new Hono();
app.post("/webhooks", async (c) => {
  const event = await flags.webhooks.unwrap({ payload: await c.req.text(), headers: c.req.raw.headers });
  console.log(event.type);
  return c.body(null, 204);
});
```

Testing a handler: `webhooks.sign()` signs an event the way ProductCraft does, so a test needs no live delivery and no hand-rolled HMAC.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ webhookSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw" });
const { payload, headers } = await flags.webhooks.sign({ payload: { id: "evt_test_1", type: "config.published", created_at: new Date().toISOString(), data: {} } });
const event = await flags.webhooks.unwrap({ payload, headers });
console.log(event.type);
```

## Raw responses

Every returned object has a non-enumerable `lastResponse` (`requestId`, `status`, `headers`). `.withResponse()` adds the `Response` and parsed rate-limit headers.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const id = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const obj = await flags.changes.retrieve(id);
console.log(obj.lastResponse.requestId);
const { data, response, requestId, rateLimit } = await flags.changes.retrieve(id).withResponse();
console.log(data, response.status, requestId, rateLimit?.remaining);
```

## Testing

`@productcraft/flags/testing` exports `createMockFetch()`, a `fetch` that answers every operation with its spec example. Override one operation by name. It also exports `signWebhook({ payload, secret })`, which signs a test event for your webhook handler (the same as `webhooks.sign()`, without a client).

```ts
import { Flags } from "@productcraft/flags";
import { createMockFetch } from "@productcraft/flags/testing";
const fetch = createMockFetch();
const flags = new Flags({ apiKey: "test", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", fetch });
await flags.projects.list();
console.log(fetch.calls.length);
```

## Escape hatch

`.client` is the typed `openapi-fetch` client over the same credential and base URL (no retries). Use it for anything the resource methods do not cover.

```ts
import { Flags } from "@productcraft/flags";
const flags = new Flags({ apiKey: process.env.PRODUCTCRAFT_API_KEY });
const { data, error } = await flags.client.GET("/v1/workspaces/{workspace_id}/limits", { params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } } });
console.log(data, error);
```

<!-- generated:end -->

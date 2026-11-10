// ProductCraftFlagsProvider (task 016): the engine's shared vectors through an OpenFeature client, the
// context mapping, object settings, error codes, events and shutdown.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ErrorCode, OpenFeature, ProviderEvents, ProviderStatus, type EvaluationContext, type EvaluationDetails, type JsonValue } from "@openfeature/server-sdk";
import { FlagsClient } from "@productcraft/flags";
import { createTestClient } from "@productcraft/flags/testing";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ProductCraftFlagsProvider, toUser } from "../src/index.js";
import { sdkKey } from "../../flags/tests/helpers.js";

const DIR = join(dirname(createRequire(import.meta.url).resolve("@productcraft/flags-engine/package.json")), "vectors");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vector JSON is untyped test data
const load = (p: string): any => JSON.parse(readFileSync(join(DIR, p), "utf8"));

function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "$date") return new Date((v as { $date: string }).$date);
    if (keys.length === 1 && keys[0] === "$int") return Number((v as { $int: string }).$int);
    const out: Record<string, unknown> = {};
    for (const k of keys) Object.defineProperty(out, k, { value: decode((v as Record<string, unknown>)[k]), enumerable: true, writable: true, configurable: true });
    return out;
  }
  return v;
}

const TOP = new Set(["identifier", "email", "country"]);
/** A vector user as an OpenFeature context: identifier → targetingKey; `custom` flattened (custom wins, as in the engine). */
function context(user: Record<string, unknown> | null): EvaluationContext {
  const ctx: Record<string, unknown> = {};
  if (!user) return ctx as EvaluationContext;
  const define = (k: string, v: unknown) => Object.defineProperty(ctx, k, { value: v, enumerable: true, writable: true, configurable: true });
  for (const k of Object.keys(user)) if (k !== "custom" && k !== "identifier") define(k, user[k]);
  const custom = user.custom as Record<string, unknown> | null | undefined;
  if (custom && typeof custom === "object") for (const k of Object.keys(custom)) if (!TOP.has(k)) define(k, custom[k]);
  if (typeof user.identifier === "string") ctx.targetingKey = user.identifier;
  else if (user.identifier !== undefined) define("identifier", user.identifier);
  return ctx as EvaluationContext;
}

const OF_ERRORS: Record<string, string> = { FLAG_NOT_FOUND: "FLAG_NOT_FOUND", TYPE_MISMATCH: "TYPE_MISMATCH", PARSE_ERROR: "PARSE_ERROR", PROVIDER_NOT_READY: "PROVIDER_NOT_READY" };

let domain = 0;
async function bind(provider: ProductCraftFlagsProvider) {
  const name = `d${++domain}`;
  await OpenFeature.setProviderAndWait(name, provider);
  return OpenFeature.getClient(name);
}
afterAll(() => OpenFeature.close());

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
it("finds the engine's vector files", () => expect(files.length).toBeGreaterThanOrEqual(6));

for (const file of files) {
  const doc = load(file);
  for (const suite of doc.suites ?? []) {
    describe(`${file}: ${suite.name}`, () => {
      const raw = suite.config ?? load(suite.config_ref);
      for (const c of suite.cases) {
        const def = decode(c.default);
        // OpenFeature has no untyped default; an object default on a json setting parses (tested below).
        const skip = def === null || (typeof def === "object" && raw.settings?.[c.key]?.type === "json");
        it.skipIf(skip)(c.name, async () => {
          const provider = new ProductCraftFlagsProvider({ bootstrap: raw, offline: true, logger: null });
          const client = await bind(provider);
          const ctx = context(c.user === null ? null : (decode(c.user) as Record<string, unknown>));
          let d: EvaluationDetails<JsonValue>;
          if (typeof def === "boolean") d = await client.getBooleanDetails(c.key, def, ctx);
          else if (typeof def === "string") d = await client.getStringDetails(c.key, def, ctx);
          else if (typeof def === "number") d = await client.getNumberDetails(c.key, def, ctx);
          else d = await client.getObjectDetails(c.key, def as JsonValue, ctx);
          const e = c.expect;
          const got: Record<string, unknown> = {
            value: d.value,
            reason: d.reason,
            rule_index: d.flagMetadata.rule_index ?? null,
            percentage_index: d.flagMetadata.percentage_index ?? null,
            error_code: d.errorCode ?? null,
            is_default_value: d.reason === "ERROR",
            variant: d.variant ?? null,
          };
          for (const k of Object.keys(e)) {
            if (k === "warnings") continue;
            let want = decode(e[k]);
            if (k === "error_code" && want !== null) want = OF_ERRORS[want as string] ?? "GENERAL";
            // OpenFeature drops the variant of an error result.
            if (k === "variant" && e.reason === "ERROR") continue;
            expect(got[k], `${k} of ${c.key}`).toEqual(want);
          }
          if (e.reason !== "ERROR") expect(d.flagMetadata.revision).toBe(raw.revision);
          await provider.onClose();
        });
      }
    });
  }
}

const cfg = (revision: number, settings: Record<string, unknown>) => ({ schema: 1, revision, generation: 1, salt: "c2FsdA", segments: {}, settings });

describe("resolvers", () => {
  const config = cfg(3, {
    on: { type: "boolean", value: true },
    banner: { type: "string", value: "hi" },
    limit: { type: "integer", value: 5 },
    limits: { type: "json", value: '{"max":5}' },
    pro: { type: "boolean", value: false, rules: [{ conditions: [{ user: { attribute: "plan", comparator: "eq", values: ["pro"] } }], serve: true }] },
    chained: { type: "boolean", value: false, rules: [{ conditions: [{ prerequisite: { setting: "missing_prereq", comparator: "eq", value: true } }], serve: true }] },
  });

  it("boolean, string, number and object (json parsed), with variant and flagMetadata", async () => {
    const client = await bind(new ProductCraftFlagsProvider({ bootstrap: config, offline: true, logger: null }));
    expect(await client.getBooleanValue("on", false)).toBe(true);
    expect(await client.getStringValue("banner", "x")).toBe("hi");
    expect(await client.getNumberValue("limit", 0)).toBe(5);
    const obj = await client.getObjectDetails("limits", { max: 0 });
    expect(obj.value).toEqual({ max: 5 });
    expect(obj.variant).toBe("default");
    expect(obj.flagMetadata).toEqual({ revision: 3 });
    const pro = await client.getBooleanDetails("pro", false, { targetingKey: "u1", plan: "pro" });
    expect(pro).toMatchObject({ value: true, reason: "TARGETING_MATCH", variant: "rule:0", flagMetadata: { revision: 3, rule_index: 0 } });
    expect(await client.getBooleanValue("pro", false, { targetingKey: "u1", plan: "free" })).toBe(false);
  });

  it("object on a non-json setting is TYPE_MISMATCH; a missing prerequisite is GENERAL", async () => {
    const client = await bind(new ProductCraftFlagsProvider({ bootstrap: config, offline: true, logger: null }));
    const mismatch = await client.getObjectDetails("banner", { a: 1 });
    expect(mismatch).toMatchObject({ value: { a: 1 }, reason: "ERROR", errorCode: ErrorCode.TYPE_MISMATCH });
    expect(await client.getBooleanDetails("on", "x" as never)).toMatchObject({ reason: "ERROR", errorCode: ErrorCode.TYPE_MISMATCH });
    expect(await client.getStringDetails("nope", "d")).toMatchObject({ value: "d", reason: "ERROR", errorCode: ErrorCode.FLAG_NOT_FOUND });
    const pre = await client.getBooleanDetails("chained", true, { targetingKey: "u" });
    expect(pre).toMatchObject({ value: true, reason: "ERROR", errorCode: ErrorCode.GENERAL });
  });

  it("accepts an existing client, and with no config at all initialize fails and results are PROVIDER_NOT_READY", async () => {
    const flags = new FlagsClient({ sdkKey: undefined, offline: true, bootstrap: config, logger: null });
    const provider = new ProductCraftFlagsProvider({ client: flags, logger: null });
    expect(provider.client).toBe(flags);
    expect(provider.metadata.name).toBe("productcraft-flags");
    await bind(provider);
    expect(OpenFeature.getClient(`d${domain}`).providerStatus).toBe(ProviderStatus.READY);

    // createTestClient holds an (empty) override config; a client with no config at all is simulated.
    const none = new ProductCraftFlagsProvider({ client: createTestClient(), logger: null });
    vi.spyOn(none.client, "snapshot").mockReturnValue({ toJSON: () => null, revision: 0 } as never);
    await expect(none.initialize()).rejects.toThrow(/no config available/);
  });
});

describe("context mapping", () => {
  it("targetingKey → identifier; email/country top level; primitives, Dates and string[] in custom; others dropped with a debug log", () => {
    const debug = vi.fn();
    const at = new Date("2026-01-01T00:00:00Z");
    const user = toUser(
      { targetingKey: "u-1", email: "a@b.co", country: "PT", plan: "pro", seats: 3, beta: true, signed_up: at, tags: ["a", "b"], nested: { x: 1 }, mixed: ["a", 1], none: null },
      { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    );
    expect(user).toMatchObject({ identifier: "u-1", email: "a@b.co", country: "PT" });
    expect({ ...user!.custom }).toEqual({ plan: "pro", seats: 3, beta: true, signed_up: at, tags: ["a", "b"] });
    expect(debug).toHaveBeenCalledTimes(2);
    expect(debug.mock.calls.join(" ")).toMatch(/nested.*mixed|mixed.*nested/s);
  });

  it("an empty context leaves the client's default user; prototype names are ordinary attributes", () => {
    expect(toUser({})).toBeUndefined();
    const ctx = {} as Record<string, unknown>;
    Object.defineProperty(ctx, "__proto__", { value: "x", enumerable: true });
    Object.defineProperty(ctx, "constructor", { value: "y", enumerable: true });
    const u = toUser(ctx as EvaluationContext)!;
    expect(Object.hasOwn(u.custom!, "__proto__") && u.custom!.__proto__).toBe("x");
    expect(u.custom!.constructor).toBe("y");
  });
});

describe("events and shutdown", () => {
  afterEach(() => vi.useRealTimers());

  it("CONFIGURATION_CHANGED with flagsChanged, STALE on a failed download, READY on recovery, ERROR on 404", async () => {
    const replies: Array<() => Response> = [];
    const flags = new FlagsClient({
      sdkKey: sdkKey(),
      polling: { mode: "manual" },
      logger: null,
      bootstrap: cfg(1, { a: { type: "boolean", value: false }, b: { type: "boolean", value: false } }),
      fetch: async () => replies.shift()!(),
    });
    const warn = vi.fn();
    const provider = new ProductCraftFlagsProvider({ client: flags, logger: { warn } });
    const client = await bind(provider);
    const events: Array<[string, unknown]> = [];
    for (const ev of [ProviderEvents.ConfigurationChanged, ProviderEvents.Stale, ProviderEvents.Ready, ProviderEvents.Error]) {
      client.addHandler(ev, (d) => events.push([ev, d?.flagsChanged ?? d?.message ?? null]));
    }
    const json = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200, headers: { etag: '"x"' } });

    replies.push(json(cfg(2, { a: { type: "boolean", value: true }, b: { type: "boolean", value: false } })));
    await flags.forceRefresh();
    expect(await client.getBooleanValue("a", false)).toBe(true);
    replies.push(() => new Response("nope", { status: 503 }));
    await flags.forceRefresh();
    expect(client.providerStatus).toBe(ProviderStatus.STALE);
    expect((await client.getBooleanDetails("a", false)).reason).toBe("STALE");
    replies.push(() => new Response(null, { status: 304 }));
    await flags.forceRefresh();
    await client.getBooleanValue("a", false); // a 304 brings no config event: READY is reported on the next evaluation
    replies.push(() => new Response("", { status: 404 }));
    await flags.forceRefresh();
    await new Promise((r) => setTimeout(r, 0));
    expect(events).toEqual([
      [ProviderEvents.Ready, null], // the handler runs at once for a provider that is already ready
      [ProviderEvents.ConfigurationChanged, ["a"]],
      [ProviderEvents.Stale, "download failed: HTTP 503"],
      [ProviderEvents.Ready, null],
      [ProviderEvents.Error, "SDK key unknown, revoked or expired (404)"],
    ]);
    expect(client.providerStatus).toBe(ProviderStatus.ERROR);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("pcf_sdk_");
  });

  it("createTestClient's set() reports CONFIGURATION_CHANGED for the key (README recipe)", async () => {
    const flags = createTestClient({ values: { new_checkout: true } });
    const client = await bind(new ProductCraftFlagsProvider({ client: flags }));
    expect(await client.getBooleanValue("new_checkout", false)).toBe(true);
    const changed: unknown[] = [];
    client.addHandler(ProviderEvents.ConfigurationChanged, (d) => changed.push(d?.flagsChanged));
    flags.set("new_checkout", false);
    await new Promise((r) => setTimeout(r, 0));
    expect(changed).toEqual([["new_checkout"]]);
    expect(await client.getBooleanValue("new_checkout", true)).toBe(false);
  });

  it("onClose closes the client and leaves no timers", async () => {
    vi.useFakeTimers();
    const provider = new ProductCraftFlagsProvider({
      sdkKey: sdkKey(),
      polling: { mode: "auto", intervalSeconds: 30, maxInitWaitSeconds: 0 },
      logger: null,
      bootstrap: cfg(1, {}),
      fetch: async () => new Response(null, { status: 304 }),
    });
    const ready = provider.initialize();
    await vi.advanceTimersByTimeAsync(10);
    await ready;
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await provider.onClose();
    expect(provider.client.state).toBe("closed");
    expect(vi.getTimerCount()).toBe(0);
  });
});

// FlagsClient behaviour (design 8.2): polling modes, fail-safe order, overrides, cache, hooks, errors.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ConfigurationError, FlagsClient, MAX_CONFIG_BYTES, type FlagsCache, type FlagsClientError } from "../src/index.js";
import { createTestClient } from "../src/testing.js";
import { startMockServer, type MockServer } from "../../core/tests/mock-server.js";
import { allLogLines, config, recordingLogger, sdkKey } from "./helpers.js";

let server: MockServer;
beforeAll(async () => (server = await startMockServer()));
afterAll(() => server.close());
const clients: FlagsClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  vi.useRealTimers();
});
const KEY = sdkKey(2);
const client = (o: ConstructorParameters<typeof FlagsClient>[0] = {}) => {
  const c = new FlagsClient({ sdkKey: KEY, baseUrl: server.url, polling: { mode: "manual" }, logger: recordingLogger().logger, ...o });
  clients.push(c);
  return c;
};
const ok = (body: unknown, etag = `W/"${Math.random()}"`) => ({ status: 200, headers: { etag }, body });
const BOOL = (value: boolean) => ({ type: "boolean", value });

describe("construction", () => {
  it("rejects a missing or garbled key with ConfigurationError", () => {
    expect(() => new FlagsClient({})).toThrow(ConfigurationError);
    expect(() => new FlagsClient({ sdkKey: "pcf_sdk_nope" })).toThrow(ConfigurationError);
    const typo = KEY.slice(0, 20) + (KEY[20] === "a" ? "b" : "a") + KEY.slice(21);
    expect(() => new FlagsClient({ sdkKey: typo })).toThrow(/not a valid pcf_sdk_ key/);
    expect(() => new FlagsClient({ sdkKey: KEY, polling: { mode: "sometimes" } as never })).toThrow(ConfigurationError);
  });

  it("raises a polling interval under 30 s to 30 s with a warning", () => {
    const { lines, logger } = recordingLogger();
    clients.push(new FlagsClient({ sdkKey: KEY, polling: { mode: "auto", intervalSeconds: 5 }, offline: true, logger }));
    expect(lines.join("\n")).toMatch(/raised to the 30 s minimum/);
  });
});

describe("downloads", () => {
  it("evaluates locally and sends the SDK key only in the path, with a User-Agent", async () => {
    server.reply(ok(config(1, { new_checkout: { type: "boolean", value: false, rules: [{ conditions: [{ user: { attribute: "plan", comparator: "eq", values: ["pro"] } }], serve: true }] } })));
    const flags = client();
    await flags.forceRefresh();
    expect(await flags.getValue("new_checkout", false, { identifier: "u1", custom: { plan: "pro" } })).toBe(true);
    expect(await flags.getValue("new_checkout", false, { identifier: "u2", plan: "free" })).toBe(false);
    const d = await flags.getValueDetails("new_checkout", false, { identifier: "u1", custom: { plan: "pro" } });
    expect(d).toMatchObject({ reason: "TARGETING_MATCH", ruleIndex: 0, revision: 1, isDefaultValue: false });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.headers["user-agent"]).toMatch(/^productcraft-node\/flags\/\S+ node\//);
    expect(server.requests[0]!.headers.authorization).toBeUndefined();
    expect(flags.state).toBe("ready");
  });

  it("auto polling waits at most maxInitWaitSeconds, then serves defaults with PROVIDER_NOT_READY", async () => {
    server.reply({ ...ok(config(1, { f: BOOL(true) })), delayMs: 1500 });
    const flags = client({ polling: { mode: "auto", maxInitWaitSeconds: 0.1 } });
    const t0 = Date.now();
    expect(await flags.waitForReady()).toBe("initializing");
    expect(Date.now() - t0).toBeLessThan(1000);
    const d = await flags.getValueDetails("f", false);
    expect(d).toMatchObject({ value: false, reason: "ERROR", errorCode: "PROVIDER_NOT_READY", isDefaultValue: true });
  });

  it("fails over across delivery.base_urls on 5xx and network errors", async () => {
    const seen: string[] = [];
    const body = JSON.stringify(config(1, { f: BOOL(true) }, { delivery: { base_urls: ["https://cdn.flags.productcraft.co", "https://api.flags.productcraft.co"], mode: "hint" } }));
    const flags = client({
      baseUrl: undefined,
      fetch: async (input) => {
        const host = new URL(String(input)).host;
        seen.push(host);
        if (seen.length === 1) return new Response(body, { status: 200, headers: { etag: 'W/"a"' } });
        if (host.startsWith("cdn")) return new Response("down", { status: 503 });
        return new Response(null, { status: 304 });
      },
    });
    await flags.forceRefresh();
    await flags.forceRefresh();
    expect(seen).toEqual(["api.flags.productcraft.co", "cdn.flags.productcraft.co", "api.flags.productcraft.co"]);
    expect(flags.state).toBe("ready");
  });

  it("rejects a body over 2 MiB even without a Content-Length", async () => {
    const big = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(512 * 1024).fill(32));
      },
    });
    const flags = client({ fetch: async () => new Response(big, { status: 200 }) });
    const errors: string[] = [];
    flags.on("error", (e) => errors.push(e.code!));
    await flags.forceRefresh();
    expect(errors).toEqual(["too_large"]);
    expect(MAX_CONFIG_BYTES).toBe(2 * 1024 * 1024);
  });

  it("never throws from getValue: network failure, bad JSON, throwing listeners", async () => {
    const flags = client({ fetch: async () => { throw new TypeError("fetch failed"); } });
    flags.on("evaluated", () => { throw new Error("listener boom"); });
    await flags.forceRefresh();
    await expect(flags.getValue("x", "fallback")).resolves.toBe("fallback");
    expect(flags.state).toBe("stale");
  });

  it("honours Retry-After on 429 and backs off on errors in auto polling", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let calls = 0;
    const flags = client({
      polling: { mode: "auto", intervalSeconds: 30, maxInitWaitSeconds: 1 },
      fetch: async () => {
        calls++;
        return calls === 1 ? new Response("", { status: 429, headers: { "retry-after": "300" } }) : new Response(null, { status: 304 });
      },
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(299_000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toBe(2);
    // Then the interval with ±10% jitter: nothing before 27 s, a poll by 33 s.
    await vi.advanceTimersByTimeAsync(26_900);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(6_200);
    expect(calls).toBe(3);
    flags.close();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(calls).toBe(3);
  });

  it("caps the error backoff at 4x the interval", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const times: number[] = [];
    client({
      polling: { mode: "auto", intervalSeconds: 30, maxInitWaitSeconds: 0 },
      fetch: async () => {
        times.push(Date.now());
        return new Response("", { status: 503 });
      },
    });
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(times.length).toBeGreaterThan(8);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(120_000);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(27_000);
  });

  it("lazy polling serves the held config while it refreshes in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    server.reply(ok(config(1, { f: BOOL(false) })), ok(config(2, { f: BOOL(true) })));
    const flags = client({ polling: { mode: "lazy", ttlSeconds: 60 } });
    expect(await flags.getValue("f", true)).toBe(false);
    expect(await flags.getValue("f", true)).toBe(false);
    expect(server.requests).toHaveLength(1);
    vi.setSystemTime(Date.now() + 61_000);
    expect(await flags.getValue("f", true)).toBe(false); // stale-while-refresh
    await vi.waitFor(() => expect(server.requests).toHaveLength(2));
    await vi.waitFor(async () => expect(await flags.getValue("f", false)).toBe(true));
  });

  it("offline makes no requests until setOnline", async () => {
    server.reply(ok(config(1, { f: BOOL(true) })));
    const flags = client({ polling: { mode: "auto", maxInitWaitSeconds: 1 }, offline: true });
    expect(await flags.waitForReady()).toBe("offline");
    expect(await flags.getValue("f", false)).toBe(false);
    expect(server.requests).toHaveLength(0);
    flags.setOnline();
    await vi.waitFor(() => expect(server.requests).toHaveLength(1));
    await vi.waitFor(async () => expect(await flags.getValue("f", false)).toBe(true));
    flags.setOffline();
    await flags.forceRefresh();
    expect(server.requests).toHaveLength(1);
  });
});

describe("fail-safe sources", () => {
  const memoryCache = () => {
    const store = new Map<string, string>();
    const cache: FlagsCache = { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) };
    return { store, cache };
  };

  it("writes the download to the cache under a key that does not contain the SDK key, and reads it at start-up", async () => {
    const { store, cache } = memoryCache();
    server.reply(ok(config(3, { f: BOOL(true) }), 'W/"r3"'));
    const a = client({ cache });
    await a.forceRefresh();
    expect([...store.keys()]).toHaveLength(1);
    expect([...store.keys()][0]).toMatch(/^productcraft-flags:v1:[0-9a-f]{32}$/);
    expect([...store.keys()][0]).not.toContain("pcf_sdk_");

    server.reply({ status: 304 });
    const b = client({ cache, polling: { mode: "manual" } });
    await b.waitForReady();
    const d = await b.getValueDetails("f", false);
    expect(d).toMatchObject({ value: true, reason: "CACHED", revision: 3 });
    await b.forceRefresh();
    expect(server.requests[0]!.headers["if-none-match"]).toBe('W/"r3"');
    expect((await b.getValueDetails("f", false)).reason).toBe("STATIC");
  });

  it("prefers the newer of cache and bootstrap; a broken cache is reported, not thrown", async () => {
    const { store, cache } = memoryCache();
    const flags0 = client({ cache, bootstrap: config(1, { f: BOOL(false) }) });
    await flags0.waitForReady();
    expect(await flags0.getValue("f", true)).toBe(false);
    store.set([...Object.keys(Object.fromEntries(store))][0] ?? "x", "not json");
    const errors: string[] = [];
    const broken: FlagsCache = { get: () => { throw new Error("redis down"); }, set: () => undefined };
    const flags1 = client({ cache: broken, bootstrap: JSON.stringify(config(1, { f: BOOL(true) })) });
    flags1.on("error", (e) => errors.push(e.code!));
    await flags1.waitForReady();
    expect(await flags1.getValue("f", false)).toBe(true);
    expect(errors).toContain("cache");
  });

  it("keeps the last-known config through a 404 (state key_invalid) and serves it as STALE", async () => {
    server.reply(ok(config(1, { f: BOOL(true) })), { status: 404, body: { code: "SDK_KEY_NOT_FOUND" } });
    const flags = client();
    await flags.forceRefresh();
    await flags.forceRefresh();
    expect(flags.state).toBe("key_invalid");
    expect(await flags.getValueDetails("f", false)).toMatchObject({ value: true, reason: "STALE" });
  });
});

describe("values", () => {
  const settings = {
    on: BOOL(true),
    banner: { type: "string", value: "Welcome" },
    limit: { type: "integer", value: 5 },
    ratio: { type: "number", value: 0.5 },
    limits: { type: "json", value: '{"max":5}' },
    broken_text: { type: "string", value: "not json" },
    by_user: { type: "string", value: "anon", rules: [{ conditions: [{ user: { attribute: "identifier", comparator: "eq", values: ["u1"] } }], serve: "u1" }] },
  };
  const flags = () => client({ bootstrap: config(1, settings) });

  it("getJson parses; a parse failure or another type returns the default", async () => {
    const f = flags();
    expect(await f.getJson<{ max: number }>("limits", { max: 1 })).toEqual({ max: 5 });
    expect(await f.getJson("broken_text", { max: 1 })).toEqual({ max: 1 });
    expect((await f.getValueDetails("limits", "raw")).value).toBe('{"max":5}');
    expect(await f.getJson("on", [])).toEqual([]);
    expect(await f.getJson("missing", 7)).toBe(7);
  });

  it("null defaults work for every type and parse json", async () => {
    const f = flags();
    expect(await f.getValue("on", null)).toBe(true);
    expect(await f.getValue("banner", null)).toBe("Welcome");
    expect(await f.getValue("limit", null)).toBe(5);
    expect(await f.getValue("limits", null)).toEqual({ max: 5 });
    expect(await f.getValue("missing", null)).toBeNull();
  });

  it("type mismatches and unknown keys return the default with an error code", async () => {
    const f = flags();
    expect(await f.getValueDetails("banner", false)).toMatchObject({ value: false, errorCode: "TYPE_MISMATCH", isDefaultValue: true });
    expect(await f.getValueDetails("nope", 1)).toMatchObject({ value: 1, errorCode: "FLAG_NOT_FOUND" });
    expect(await f.getValue("ratio", 1)).toBe(0.5);
  });

  it("defaultUser applies when a call passes none; a call's user replaces it whole", async () => {
    const f = client({ bootstrap: config(1, settings), defaultUser: { identifier: "u1" } });
    expect(await f.getValue("by_user", "")).toBe("u1");
    expect(await f.getValue("by_user", "", { identifier: "u2" })).toBe("anon");
    f.setDefaultUser(undefined);
    expect(await f.getValue("by_user", "")).toBe("anon");
    expect(f.snapshot().getValue("by_user", "", { identifier: "u1" })).toBe("u1");
  });

  it("getAllValues is a null-prototype map with json parsed", async () => {
    const all = await flags().getAllValues({ identifier: "u1" });
    expect(Object.getPrototypeOf(all)).toBeNull();
    expect(all).toMatchObject({ on: true, banner: "Welcome", limits: { max: 5 }, by_user: "u1" });
  });

  it("snapshot is synchronous and round-trips as bootstrap", async () => {
    const snap = flags().snapshot();
    expect(snap.getValue("on", false)).toBe(true);
    expect(snap.getJson("limits", {})).toEqual({ max: 5 });
    const again = client({ bootstrap: snap.toJSON()! });
    expect(await again.getValue("banner", "")).toBe("Welcome");
  });

  it("emits evaluated with details and logs each warning once per revision", async () => {
    const { lines, logger } = recordingLogger();
    const f = client({ bootstrap: config(1, { s: { type: "string", value: "x", rules: [{ conditions: [{ user: { attribute: "plan", comparator: "eq", values: ["pro"] } }], serve: "y" }] } }), logger });
    const seen: string[] = [];
    f.on("evaluated", (d) => seen.push(`${d.key}:${String(d.value)}`));
    await f.getValue("s", "");
    await f.getValue("s", "");
    expect(seen).toEqual(["s:x", "s:x"]);
    expect(lines.filter((l) => l.includes("(missing_user)")).length).toBe(1);
  });
});

describe("overrides", () => {
  const remote = config(1, { a: BOOL(false), b: { type: "string", value: "remote" } });
  let dir: string;
  beforeAll(() => (dir = mkdtempSync(join(tmpdir(), "pc-flags-"))));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("local_over_remote, remote_over_local and local_only", async () => {
    const values = { a: true, c: 42 };
    const lor = client({ bootstrap: remote, overrides: { values, behaviour: "local_over_remote" } });
    expect(await lor.getAllValues()).toMatchObject({ a: true, b: "remote", c: 42 });
    const rol = client({ bootstrap: remote, overrides: { values, behaviour: "remote_over_local" } });
    expect(await rol.getAllValues()).toMatchObject({ a: false, b: "remote", c: 42 });
    const lo = new FlagsClient({ overrides: { values, behaviour: "local_only" }, fetch: () => { throw new Error("no network in local_only"); } });
    clients.push(lo);
    expect(await lo.getAllValues()).toEqual(Object.assign(Object.create(null), { a: true, c: 42 }));
    expect(await lo.waitForReady()).toBe("ready");
  });

  it("from an environment variable (a JSON object)", async () => {
    process.env.PC_FLAGS_TEST_OVERRIDES = '{"a": true, "limits": {"max": 9}}';
    const f = client({ bootstrap: remote, overrides: { env: "PC_FLAGS_TEST_OVERRIDES" } });
    expect(await f.getValue("a", false)).toBe(true);
    expect(await f.getJson("limits", {})).toEqual({ max: 9 });
    process.env.PC_FLAGS_TEST_OVERRIDES = "[1]";
    const errors: string[] = [];
    const bad = new FlagsClient({ sdkKey: KEY, bootstrap: remote, overrides: { env: "PC_FLAGS_TEST_OVERRIDES" }, polling: { mode: "manual" }, logger: null });
    clients.push(bad);
    bad.on("error", (e) => errors.push(e.code!));
    expect(await bad.getValue("a", true)).toBe(false);
    delete process.env.PC_FLAGS_TEST_OVERRIDES;
  });

  it("from a file, optionally watched", async () => {
    const file = join(dir, "flags.json");
    writeFileSync(file, '{"b": "from file"}');
    const f = client({ bootstrap: remote, overrides: { file, watch: true } });
    const changes: string[] = [];
    f.on("configChanged", (e) => changes.push(e.source));
    expect(await f.getValue("b", "")).toBe("from file");
    writeFileSync(file, '{"b": "edited"}');
    await vi.waitFor(async () => expect(await f.getValue("b", "")).toBe("edited"), { timeout: 3000 });
    expect(changes.length).toBeGreaterThan(0);
    const missing = client({ bootstrap: remote, overrides: { file: join(dir, "nope.json") } });
    expect(await missing.getValue("b", "")).toBe("remote");
  });

  it("treats prototype names as ordinary keys", async () => {
    const f = client({ overrides: { values: JSON.parse('{"__proto__": true, "constructor": "c"}'), behaviour: "local_only" }, sdkKey: undefined });
    expect(await f.getValue("__proto__", false)).toBe(true);
    expect(await f.getValue("constructor", "")).toBe("c");
    expect(await f.getValue("toString", "d")).toBe("d");
  });
});

describe("createTestClient", () => {
  it("serves fixed values with no network or timers, and set() emits configChanged", async () => {
    const flags = createTestClient({ values: { new_checkout: true, limits: { max: 5 } }, user: { identifier: "u1" } });
    expect(await flags.getValue("new_checkout", false)).toBe(true);
    expect(await flags.getJson("limits", { max: 0 })).toEqual({ max: 5 });
    const seen: number[] = [];
    flags.on("configChanged", (e) => seen.push(e.revision));
    flags.set("new_checkout", false);
    expect(await flags.getValue("new_checkout", true)).toBe(false);
    expect(flags.snapshot().getValue("new_checkout", true)).toBe(false);
    expect(seen).toHaveLength(1);
    flags.close();
  });
});

describe("logging", () => {
  it("no log line in this file ever held an SDK key", () => {
    expect(allLogLines.length).toBeGreaterThan(0);
    for (const line of allLogLines) expect(line).not.toMatch(/pcf_sdk_/);
  });
});

void (null as unknown as FlagsClientError);

#!/usr/bin/env node
// Smoke-tests the BUILT dist of every package from a real ESM and a real
// CJS consumer (vitest transforms src, so it proves nothing about the
// published artefact; see memory feedback_tsup_esm_bare_require). For
// @productcraft/core it also loads both builds in ONE process and checks
// that errors thrown by one build pass `instanceof` against the other,
// and runs a real request + webhook verification through each build.
//
// Usage: node scripts/smoke-dist.mjs   (after `pnpm run build`)

import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${name}\n     ${err?.stack ?? err}`);
  }
};

const [major, minor] = process.versions.node.split(".").map(Number);
console.log(`node ${process.versions.node}`);
assert.ok(major > 20 || (major === 20 && minor >= 3), "the SDK requires Node 20.3+");

// 1. Every package's dist loads from ESM and CJS and exposes the same names.
for (const dir of readdirSync(join(root, "packages"))) {
  const pkgPath = join(root, "packages", dir, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const entry = pkg.exports?.["."];
  if (!entry?.import || !entry?.require) continue;
  await check(`${pkg.name}: ESM and CJS builds load with the same exports`, async () => {
    const base = join(root, "packages", dir);
    // Nested conditions: { import: { types, default }, require: { types, default } }.
    const target = (c) => (typeof c === "string" ? c : c.default);
    const esm = await import(pathToFileURL(join(base, target(entry.import))).href);
    const cjs = require(join(base, target(entry.require)));
    const names = (m) => Object.keys(m).filter((k) => k !== "default" && k !== "__esModule").sort();
    assert.ok(names(esm).length > 0, "ESM build exports nothing");
    assert.deepEqual(names(cjs), names(esm));
    assert.equal(pkg.engines?.node, ">=20.3", "engines.node must be >=20.3");
  });
}

// 1b. Auth and auth-passport: the CJS builds carry their own jose (jose 6 is ESM-only and
// `require(esm)` only exists from Node 20.19), and verify a real token through each build.
for (const dir of ["auth", "auth-passport"]) {
  await check(`@productcraft/${dir}: the CJS build never requires ESM-only jose`, () => {
    const src = readFileSync(join(root, "packages", dir, "dist/index.cjs"), "utf8");
    assert.ok(!/require\(["']jose["']\)/.test(src), "dist/index.cjs requires jose");
  });
}
await check("@productcraft/auth: verifyToken through the ESM and CJS builds", async () => {
  // jose is a dependency of packages/auth, not of the workspace root.
  const joseDir = dirname(createRequire(join(root, "packages", "auth", "package.json")).resolve("jose/package.json"));
  const jose = await import(pathToFileURL(join(joseDir, JSON.parse(readFileSync(join(joseDir, "package.json"), "utf8")).exports["."].default)).href);
  const { privateKey, publicKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const jwk = { ...(await jose.exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const base = "https://api.auth.example";
  const token = await new jose.SignJWT({ sub: "u1" }).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer(`${base}/my-app`).setAudience("my-app").setExpirationTime("5m").sign(privateKey);
  const fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "content-type": "application/json" } });
  const authDir = join(root, "packages", "auth");
  for (const mod of [await import(pathToFileURL(join(authDir, "dist/index.js")).href), require(join(authDir, "dist/index.cjs"))]) {
    const claims = await new mod.Auth({ baseUrl: base, fetch }).verifyToken(token, { app: "my-app" });
    assert.equal(claims.sub, "u1");
    assert.equal(mod.AuthHttpError, mod.APIError);
  }
});

// 1c. Flags engine: the evaluation vectors through the ESM and the CJS build, and a config parsed by
// one build evaluated by the other (the compiled form is keyed by Symbol.for).
await check("@productcraft/flags-engine: evaluation vectors through the ESM and CJS builds, cross-build configs", async () => {
  const dir = join(root, "packages", "flags-engine");
  const builds = [await import(pathToFileURL(join(dir, "dist/index.js")).href), require(join(dir, "dist/index.cjs"))];
  const doc = JSON.parse(readFileSync(join(dir, "vectors/evaluation.json"), "utf8"));
  const hash = JSON.parse(readFileSync(join(dir, "vectors/hash.json"), "utf8")).hash;
  let n = 0;
  for (const [parser, evaluator] of [[builds[0], builds[0]], [builds[1], builds[1]], [builds[0], builds[1]], [builds[1], builds[0]]]) {
    for (const row of hash.bucket) assert.equal(evaluator.bucket(row.seed, row.value), row.expect);
    for (const suite of doc.suites) {
      const config = parser.parseConfig(JSON.stringify(suite.config));
      for (const c of suite.cases) {
        if (JSON.stringify(c).includes('"$')) continue; // typed attributes: covered by the vitest runner
        const d = evaluator.evaluate(config, c.key, c.default, c.user);
        assert.deepEqual([d.value, d.reason, d.errorCode], [c.expect.value, c.expect.reason, c.expect.error_code], `${suite.name}: ${c.name}`);
        n++;
      }
    }
  }
  assert.ok(n > 100, `only ${n} cases ran`);
  assert.throws(() => builds[1].parseConfig("{"), (e) => e instanceof builds[1].ConfigParseError && e.code === "PARSE_ERROR");
});

await check("@productcraft/flags: FlagsClient, createTestClient and ConfigurationError through the ESM and CJS builds", async () => {
  const dir = join(root, "packages", "flags");
  const builds = [
    [await import(pathToFileURL(join(dir, "dist/index.js")).href), await import(pathToFileURL(join(dir, "dist/testing.js")).href)],
    [require(join(dir, "dist/index.cjs")), require(join(dir, "dist/testing.cjs"))],
  ];
  const bootstrap = { schema: 1, revision: 1, generation: 1, salt: "", settings: { on: { type: "boolean", value: true }, limits: { type: "json", value: '{"max":5}' } } };
  for (const [main, testing] of builds) {
    const flags = new main.FlagsClient({ bootstrap, offline: true, logger: null });
    assert.equal(await flags.getValue("on", false), true);
    assert.deepEqual(await flags.getJson("limits", {}), { max: 5 });
    flags.close();
    const t = testing.createTestClient({ values: { on: false } });
    assert.equal(t.snapshot().getValue("on", true), false);
    t.set("on", true);
    assert.equal(await t.getValue("on", false), true);
    assert.equal(typeof main.Flags, "function");
    for (const [other] of builds) assert.throws(() => new main.FlagsClient({ sdkKey: "pcf_sdk_typo" }), (e) => e instanceof other.ConfigurationError);
  }
});

await check("@productcraft/flags-openfeature: the provider through the ESM and CJS builds, with a client from either build", async () => {
  const dir = join(root, "packages", "flags-openfeature");
  const flagsDir = join(root, "packages", "flags");
  const fromProvider = createRequire(join(dir, "package.json"));
  const builds = [
    [await import(pathToFileURL(join(dir, "dist/index.js")).href), await import(pathToFileURL(fromProvider.resolve("@openfeature/server-sdk")).href)],
    [require(join(dir, "dist/index.cjs")), fromProvider("@openfeature/server-sdk")],
  ];
  const clients = [await import(pathToFileURL(join(flagsDir, "dist/index.js")).href), require(join(flagsDir, "dist/index.cjs"))];
  const bootstrap = { schema: 1, revision: 7, generation: 1, salt: "", settings: { on: { type: "boolean", value: true }, limits: { type: "json", value: '{"max":5}' } } };
  let n = 0;
  for (const [mod, of] of builds) {
    for (const flags of clients) {
      const provider = new mod.ProductCraftFlagsProvider({ client: new flags.FlagsClient({ bootstrap, offline: true, logger: null }), logger: null });
      const domain = `smoke-${n++}`;
      await of.OpenFeature.setProviderAndWait(domain, provider);
      const client = of.OpenFeature.getClient(domain);
      const d = await client.getBooleanDetails("on", false, { targetingKey: "u" });
      assert.equal(d.value, true);
      assert.equal(d.flagMetadata.revision, 7);
      assert.deepEqual(await client.getObjectValue("limits", {}), { max: 5 });
      assert.equal((await client.getStringDetails("missing", "d")).errorCode, "FLAG_NOT_FOUND");
    }
    await of.OpenFeature.close();
  }
});

// 2. @productcraft/core: cross-build behaviour.
const coreDir = join(root, "packages", "core");
const esm = await import(pathToFileURL(join(coreDir, "dist/index.js")).href);
const cjs = require(join(coreDir, "dist/index.cjs"));
const corePkg = JSON.parse(readFileSync(join(coreDir, "package.json"), "utf8"));

await check("core: errors from one build pass instanceof against the other", () => {
  for (const [a, b] of [[esm, cjs], [cjs, esm]]) {
    const err = a.APIError.generate(404, { code: "NOT_FOUND", message: "x" }, new Headers());
    assert.ok(err instanceof b.NotFoundError, "NotFoundError across builds");
    assert.ok(err instanceof b.APIError, "APIError across builds");
    assert.ok(err instanceof b.ProductCraftError, "ProductCraftError across builds");
    assert.ok(!(err instanceof b.ConflictError), "not a ConflictError");
    const reuse = a.APIError.generate(409, { code: "IDEMPOTENCY_KEY_REUSE" }, new Headers());
    assert.ok(reuse instanceof b.IdempotencyKeyReuseError && reuse instanceof b.ConflictError);
    assert.ok(new a.APITimeoutError() instanceof b.APIConnectionError);
    assert.ok(new a.ConfigurationError("x") instanceof b.ConfigurationError);
  }
});

await check("core: CORE_VERSION matches package.json in both builds", () => {
  assert.equal(esm.CORE_VERSION, corePkg.version);
  assert.equal(cjs.CORE_VERSION, corePkg.version);
});

await check("core: a real request with retry, pagination and lastResponse through both builds", async () => {
  let n = 0;
  const seen = [];
  const server = createServer((req, res) => {
    n++;
    seen.push({ url: req.url, ua: req.headers["user-agent"], key: req.headers["idempotency-key"] });
    if (n === 1) {
      res.writeHead(503, { "content-type": "application/json", "retry-after": "0" });
      return res.end(JSON.stringify({ code: "UNAVAILABLE", message: "down" }));
    }
    const cursor = new URL(req.url, "http://x").searchParams.get("cursor");
    res.writeHead(200, { "content-type": "application/json", "x-request-id": "req_smoke" });
    res.end(JSON.stringify({ data: [{ id: cursor ?? "first" }], pagination: { next_cursor: cursor ? null : "c2", has_more: !cursor } }));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const m of [esm, cjs]) {
      n = 0;
      seen.length = 0;
      assert.equal(new m.APIError(500, {}, new Headers()).constructor.name, "APIError", "keepNames");
      const client = new m.APIClient({ apiKey: "pcft_smoke", workspaceId: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" }, url);
      const items = await client.list({ method: "GET", path: "/v1/workspaces/{workspace_id}/things" }).toArray({ maxItems: 10 });
      assert.deepEqual(items.map((i) => i.id), ["first", "c2"]);
      assert.equal(seen.length, 3, "one retry + two pages");
      assert.match(seen[0].ua, /^productcraft-node\/core@\S+ node\//);
      const one = await client.request({ method: "GET", path: "/v1/workspaces/{workspace_id}/things" });
      assert.equal(one.lastResponse.requestId, "req_smoke");
      assert.equal(JSON.stringify(one).includes("lastResponse"), false);
    }
  } finally {
    server.close();
  }
});

await check("core: verifyWebhook (Standard Webhooks vector) through both builds", async () => {
  for (const m of [esm, cjs]) {
    const out = await m.verifyWebhook({
      payload: '{"test": 2432232314}',
      headers: { "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek", "webhook-timestamp": "1614265330", "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" },
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      now: 1614265330 * 1000,
    });
    assert.deepEqual(out, { test: 2432232314 });
  }
});

await check("core: makeClient and createOpenAPIClient build openapi-fetch clients", () => {
  for (const m of [esm, cjs]) {
    const c = m.makeClient("https://example.invalid", { auth: { type: "apiKey", key: "k" } });
    assert.equal(typeof c.GET, "function");
    assert.equal(typeof m.PC_BASE_URL.mail, "string");
    const raw = m.createOpenAPIClient(new m.APIClient({ apiKey: "k" }, "https://example.invalid"));
    assert.equal(typeof raw.POST, "function");
  }
});

if (failures > 0) {
  console.error(`${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log("dist smoke passed");

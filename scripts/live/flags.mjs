#!/usr/bin/env node
// Live smoke for @productcraft/flags against production, in the testing-environment workspace
// (docs/sdk-standard.md section 10, task 015).
//
//   node scripts/live/flags.mjs                     uses packages/flags/dist (run `pnpm run build` first)
//   FLAGS_SDK=/abs/path/to/dist/index.js node …     uses another build (e.g. the published package)
//
// Credentials: signs in to platform-auth as [platform_auth.clauderanelagh] from ~/.secrets.toml
// (read here, never printed) and uses the session as a bearer token; logs out in `finally`.
// It creates one throwaway project `sdk-smoke-<ts>` with a boolean flag, reads the flag with
// FlagsClient through the public delivery endpoint, toggles it with the management client,
// forceRefresh()es until the flip arrives, and deletes the project in `finally` (stale
// `sdk-smoke-*` projects a killed run left behind are deleted first). It rotates no key and
// changes no workspace setting. The SDK key is revealed into memory only: never printed, and the
// script asserts that no log line FlagsClient wrote holds it. At most 2 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.FLAGS_SDK ?? new URL("../../packages/flags/dist/index.js", import.meta.url).href;
const { Flags, FlagsClient } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};

// <= 2 req/s across everything this script sends.
let last = 0;
const throttled = async (input, init) => {
  const wait = last + 500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(input, init);
};

function credentials() {
  const py = 'import tomllib,json,pathlib;c=tomllib.loads(pathlib.Path.home().joinpath(".secrets.toml").read_text())["platform_auth"]["clauderanelagh"];print(json.dumps({"identifier":c.get("email") or c["username"],"password":c["password"]}))';
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
}

async function signIn() {
  const res = await throttled(`${PLATFORM}/v1/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "sdk-smoke" },
    body: JSON.stringify({ ...credentials(), sessionDuration: 3600 }),
  });
  if (!res.ok) throw new Error(`platform sign-in failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.access_token ?? body.accessToken;
}

const token = await signIn();
const logLines = [];
const logger = { debug() {}, info() {}, warn: (...a) => logLines.push(a.join(" ")), error: (...a) => logLines.push(a.join(" ")) };
const flags = new Flags({ auth: { type: "bearer", token }, workspaceId: WORKSPACE, fetch: throttled, maxRetries: 1 });
let project;
let client;
try {
  for await (const p of flags.projects.list({ limit: 100 })) {
    if (p.name.startsWith(PREFIX)) {
      await flags.projects.delete(p.id, { confirm: p.name });
      console.log(`     swept stale project ${p.name}`);
    }
  }

  project = await flags.projects.create({ name: TAG, environment_preset: "dev_prod", note: "sdk live smoke" });
  check(typeof project.id === "string" && project.environments.length >= 2, `created project ${TAG} with ${project.environments.length} environments`);
  const env = project.environments.find((e) => e.key === "development") ?? project.environments[0];
  let configId = project.configs[0]?.id;
  if (!configId) configId = (await flags.projects.configs.create(project.id, { key: "main", name: "Main" })).id;
  const setting = await flags.configs.settings.create(configId, { key: "smoke_flag", type: "boolean", name: "Smoke flag", initial_value: false });
  check(setting.key === "smoke_flag", "created boolean flag smoke_flag");

  const keys = await flags.configs.environments.sdkKeys.reveal(configId, env.id);
  const sdkKey = keys.data[0]?.key;
  check(/^pcf_sdk_[0-9A-Za-z]{38}$/.test(sdkKey ?? ""), "revealed the environment's SDK key (not printed)");

  client = new FlagsClient({ sdkKey, polling: { mode: "manual" }, logger, fetch: throttled });
  await client.forceRefresh();
  const before = await client.getValueDetails("smoke_flag", true, { identifier: "smoke-user" });
  check(before.value === false && before.reason === "STATIC" && client.state === "ready", `FlagsClient read smoke_flag = ${before.value} (${before.reason}, revision ${before.revision})`);
  const missing = await client.getValueDetails("no_such_flag", "fallback");
  check(missing.value === "fallback" && missing.errorCode === "FLAG_NOT_FOUND", "an unknown key returns the default (FLAG_NOT_FOUND)");

  const current = await flags.settings.values.retrieve(setting.id, env.id);
  await flags.settings.values.update(setting.id, env.id, { value: true, version: current.version, note: "sdk live smoke toggle" });
  check(true, "toggled smoke_flag on with the management client");

  // Delivery sees a publish within its 5 s change feed plus the 15 s shared cache.
  let after;
  const deadline = Date.now() + 90_000;
  for (;;) {
    await client.forceRefresh();
    after = await client.getValueDetails("smoke_flag", false);
    if (after.value === true || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  check(after.value === true && after.revision > before.revision, `forceRefresh picked up the flip: ${after.value} at revision ${after.revision}`);

  const snap = client.snapshot();
  check(snap.getValue("smoke_flag", false) === true, "snapshot() evaluates synchronously");
  check(!logLines.some((l) => l.includes("pcf_sdk_") || (sdkKey && l.includes(sdkKey))), `no FlagsClient log line holds the SDK key (${logLines.length} lines)`);
} catch (e) {
  failures += 1;
  console.log(`FAIL ${e?.constructor?.name ?? "Error"}: ${e?.message ?? e} ${e?.code ? `(${e.code})` : ""}`);
} finally {
  client?.close();
  if (project) {
    try {
      await flags.projects.delete(project.id, { confirm: project.name });
      const gone = await flags.projects.retrieve(project.id).then(() => false, (e) => e?.status === 404);
      check(gone, `deleted project ${TAG}`);
    } catch (e) {
      failures += 1;
      console.log(`FAIL cleanup: ${e?.message ?? e}`);
    }
  }
  await throttled(`${PLATFORM}/v1/auth/logout-current`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => console.log("FAIL logout-current"));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);

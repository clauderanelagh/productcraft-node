#!/usr/bin/env node
// Live smoke for @productcraft/platform-auth against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/platform-auth.mjs                     uses packages/platform-auth/dist (run `pnpm run build` first)
//   PLATFORM_AUTH_SDK=/abs/path/to/dist/index.js node …     uses another build (e.g. the published package)
//
// Credentials: signs in through the SDK's own `auth.signin` as
// [platform_auth.clauderanelagh] from ~/.secrets.toml (read here, never printed)
// with a one-hour session, and logs out in `finally`. It changes no workspace
// settings, services, policies or other keys: its one resource is an API key
// named `sdk-smoke-<ts>` bound to an EXISTING managed policy (the readonly
// preset's, so no policy is created), revoked in `finally`. It first revokes
// stale active `sdk-smoke-*` keys a killed run left behind, and never touches a
// key with any other name. The minted key's plaintext is used in memory only.
// All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.PLATFORM_AUTH_SDK ?? new URL("../../packages/platform-auth/dist/index.js", import.meta.url).href;
const { PlatformAuth, NotFoundError, BadRequestError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};

// <= 4 req/s across everything this script sends.
let last = 0;
const throttled = async (input, init) => {
  const wait = last + 250 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(input, init);
};

function credentials() {
  const py = 'import tomllib,json,pathlib;c=tomllib.loads(pathlib.Path.home().joinpath(".secrets.toml").read_text())["platform_auth"]["clauderanelagh"];print(json.dumps({"identifier":c.get("email") or c["username"],"password":c["password"]}))';
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
}

// Sign-in itself goes through the SDK (a public route: no credential is sent).
const anonHeaders = [];
const anon = new PlatformAuth({
  fetch: (input, init) => {
    anonHeaders.push(new Headers(init?.headers));
    return throttled(input, init);
  },
  maxRetries: 0,
});
const session = await anon.auth.signin({ ...credentials(), session_duration: 3600 });
check(typeof session.access_token === "string" && anonHeaders.every((h) => !h.has("authorization")), "auth.signin (public route, no Authorization header)");

const platform = new PlatformAuth({ auth: { type: "bearer", token: session.access_token }, fetch: throttled });
let keyId;
try {
  // workspaces.retrieve (slug positional) with lastResponse and withResponse().
  const ws = await platform.workspaces.retrieve(WORKSPACE);
  check(ws.slug === WORKSPACE && typeof ws.id === "string", `workspaces.retrieve("${WORKSPACE}")`);
  check(typeof ws.lastResponse.requestId === "string" && ws.lastResponse.requestId.length > 0, "workspaces.retrieve carries lastResponse.requestId");
  const { data: again, requestId } = await platform.workspaces.retrieve(WORKSPACE).withResponse();
  check(again.id === ws.id && typeof requestId === "string" && requestId.length > 0, "workspaces.retrieve().withResponse() gives data and requestId");

  // Stale keys from killed runs: only active keys this script named.
  let swept = 0;
  for await (const k of platform.workspaces.apiKeys.list(WORKSPACE, { include_revoked: "false", limit: 50 })) {
    if (k.name.startsWith(PREFIX) && k.status === "active") {
      await platform.workspaces.apiKeys.delete(WORKSPACE, k.id);
      swept += 1;
    }
  }
  console.log(`revoked ${swept} stale ${PREFIX}* keys`);

  // An existing policy to bind (never create one): the readonly preset's.
  let policy;
  for await (const p of platform.workspaces.policies.list(WORKSPACE)) if (p.preset_key === "readonly") policy = p;
  if (!policy) throw new Error("no existing readonly preset policy in testing-environment; refusing to create one");

  // Create (mint) + retrieve.
  const minted = await platform.workspaces.apiKeys.create(WORKSPACE, { name: TAG, description: "SDK live smoke; revoked by the script", policy_ids: [policy.id], expires_in_days: 30 });
  keyId = minted.record.id;
  check(minted.record.name === TAG && typeof minted.token === "string" && minted.token.length > 20, "workspaces.apiKeys.create mints a key (token returned once)");
  const got = await platform.workspaces.apiKeys.retrieve(WORKSPACE, keyId);
  check(got.id === keyId && got.status === "active", `workspaces.apiKeys.retrieve (${got.status})`);

  // The minted key from its own point of view.
  const asKey = new PlatformAuth({ apiKey: minted.token, fetch: throttled });
  const me = await asKey.apiKeys.self();
  check(me.workspace_id === ws.id && me.name === TAG, "apiKeys.self() with the minted key names its workspace and itself");
  const intro = await asKey.introspect.apiKey();
  check(intro.is_valid === true && intro.workspace_id === ws.id, "introspect.apiKey() resolves the key to the workspace");
  const { data: viaClient } = await asKey.client.POST("/v1/introspect/api-key");
  check(viaClient?.workspace_id === ws.id, ".client.POST('/v1/introspect/api-key') escape hatch still works");

  // for await across pages (limit 1).
  const ids = [];
  for await (const k of platform.workspaces.apiKeys.list(WORKSPACE, { limit: 1 })) ids.push(k.id);
  check(ids.length > 1 && new Set(ids).size === ids.length && ids.includes(keyId), `workspaces.apiKeys.list({ limit: 1 }) walks ${ids.length} keys across pages`);

  // Expected errors.
  try {
    await platform.workspaces.apiKeys.retrieve(WORKSPACE, "00000000-0000-0000-0000-000000000000");
    check(false, "404 throws");
  } catch (err) {
    check(err instanceof NotFoundError && !!err.requestId && !!err.docUrl, `404 is NotFoundError (code ${err.code}, requestId and docUrl set)`);
  }
  try {
    // Invalid on purpose (empty name, unknown expiry): must never mint.
    const oops = await platform.workspaces.apiKeys.create(WORKSPACE, { name: "", policy_ids: [policy.id], expires_in_days: 7 });
    check(false, "400 throws");
    await platform.workspaces.apiKeys.delete(WORKSPACE, oops.record.id);
  } catch (err) {
    check(err instanceof BadRequestError && err.errors.length > 0, `400 is BadRequestError with errors[] (${err.errors?.map((e) => e.param).join(", ")})`);
  }
} finally {
  if (keyId) {
    await platform.workspaces.apiKeys.delete(WORKSPACE, keyId, { force: true }).then(() => console.log(`revoked key ${TAG}`), (e) => console.log(`FAIL revoke key: ${e?.message}`));
    const after = await platform.workspaces.apiKeys.retrieve(WORKSPACE, keyId).catch(() => undefined);
    check(after?.status === "revoked", `key ${TAG} is revoked (${after?.status})`);
  }
  await platform.auth.logoutCurrent().catch(() => console.log("FAIL logout-current"));
}
console.log(failures === 0 ? "live smoke: all checks passed" : `live smoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

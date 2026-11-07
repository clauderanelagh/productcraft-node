#!/usr/bin/env node
// Live smoke for @productcraft/auth against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/auth.mjs                      uses packages/auth/dist (run `pnpm run build` first)
//   AUTH_SDK=/abs/path/to/dist/index.js node …      uses another build (e.g. the published package)
//
// Credentials: signs in to Platform as [platform_auth.clauderanelagh] from
// ~/.secrets.toml (read here, never printed) and uses that session as the admin
// bearer; it logs the session out in `finally`. It changes no workspace settings,
// services, keys or policies. Everything it creates lives in one throwaway Auth app
// `sdk-smoke-<ts>` (an end user, a webhook endpoint), deleted in `finally`; stale
// `sdk-smoke-*` apps a killed run left behind are deleted first. The end user's
// address is the SES simulator, so any mail Auth sends goes nowhere real.
// All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.AUTH_SDK ?? new URL("../../packages/auth/dist/index.js", import.meta.url).href;
const { Auth, NotFoundError, AuthHttpError, APIError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const WORKSPACE_ID = "24fab978-7cd7-48ae-bce1-aba876b11957"; // testing-environment
const PLATFORM = "https://api.platform-auth.productcraft.co";
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

function platformCreds() {
  const py = 'import tomllib,json,pathlib;c=tomllib.loads(pathlib.Path.home().joinpath(".secrets.toml").read_text())["platform_auth"]["clauderanelagh"];print(json.dumps({"identifier":c.get("email") or c["username"],"password":c["password"]}))';
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
}

async function platformSignin() {
  const res = await throttled(`${PLATFORM}/v1/auth/signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...platformCreds(), session_duration: 3600 }),
  });
  if (!res.ok) throw new Error(`platform signin failed: ${res.status}`);
  return (await res.json()).access_token;
}

const token = await platformSignin();
const admin = new Auth({ auth: { type: "bearer", token }, workspaceId: WORKSPACE_ID, fetch: throttled });
let appId;
try {
  // Stale apps from killed runs (deleting an app deletes its end users and endpoints).
  let swept = 0;
  for await (const app of admin.apps.list({ workspace_id: WORKSPACE_ID, limit: 100 })) {
    if (app.slug.startsWith(PREFIX)) {
      await admin.apps.delete(app.id);
      swept += 1;
    }
  }
  console.log(`swept ${swept} stale ${PREFIX}* apps`);

  const app = await admin.apps.create({ slug: TAG, display_name: `SDK smoke ${TAG}`, workspace_id: WORKSPACE_ID });
  appId = app.id;
  check(app.slug === TAG && typeof app.lastResponse.requestId === "string", "apps.create (lastResponse.requestId)");

  // A new app has sign-up off; turn it on for this throwaway app only.
  const config = await admin.admin.app(app.id).authConfig.update({ signup_enabled: true });
  check(config.signup_enabled === true, "admin.app(id).authConfig.update (signup on, throwaway app)");

  // End user: signup, signin, refresh, verifyToken, me.retrieve.
  const consumer = new Auth({ fetch: throttled }).consumer(TAG);
  const email = `success+${TAG}@simulator.amazonses.com`;
  const password = `Sdk-smoke-${Date.now()}-pw!`;
  const signup = await consumer.signup({ username: TAG.replace(/-/g, "_"), email, password });
  check(signup.result === "session" || signup.result === "mfa_enrollment_required", `consumer(slug).signup (result ${signup.result})`);
  const session = await consumer.signin({ identifier: email, password });
  check(session.result === "session" && typeof session.access_token === "string", "consumer(slug).signin");
  const refreshed = await consumer.refresh({ refresh_token: session.refresh_token });
  check(typeof refreshed.access_token === "string" && refreshed.refresh_token !== session.refresh_token, "consumer(slug).refresh rotates the refresh token");
  const claims = await admin.verifyToken(refreshed.access_token, { app: TAG });
  check(typeof claims.sub === "string" && claims.aud === TAG, "auth.verifyToken(jwt, { app }) (JWKS, issuer, audience)");
  let refusedRefresh = false;
  try {
    await admin.verifyToken(refreshed.refresh_token, { app: TAG });
  } catch (err) {
    refusedRefresh = err?.code === "ERR_JWT_REFRESH_TOKEN" || err?.name === "JwtRefreshTokenError";
  }
  check(refusedRefresh, "verifyToken refuses a refresh token");
  const me = new Auth({ auth: { type: "bearer", token: refreshed.access_token }, fetch: throttled }).consumer(TAG);
  const profile = await me.me.retrieve();
  check(profile.email === email && profile.id === claims.sub, "consumer(slug).me.retrieve as the end user");
  const legacy = await me.me.getProfile();
  check(legacy.id === profile.id, "0.x alias me.getProfile() calls the same route");
  const legacySignin = await consumer.auth.signin({ identifier: email, password });
  check(legacySignin.result === "session", "0.x alias consumer(slug).auth.signin()");

  // Admin scope: list end users (iterated), a webhook endpoint created and deleted.
  const scope = admin.admin.app(app.id);
  const ids = [];
  for await (const u of scope.endUsers.list({ limit: 1 })) ids.push(u.id);
  check(ids.includes(profile.id), `admin.app(id).endUsers.list iterated (${ids.length} user, limit 1 per page)`);
  const viaAlias = await admin.app(app.id).endUsers.get(profile.id);
  check(viaAlias.id === profile.id, "auth.app(id).endUsers.get (0.x alias of endUsers.retrieve)");
  const endpoint = await scope.webhooks.endpoints.create({ url: `https://example.com/${TAG}`, description: TAG });
  check(typeof endpoint.id === "string" && typeof endpoint.signing_secret === "string", "webhooks.endpoints.create (secret shown once)");
  await scope.webhooks.endpoints.delete(endpoint.id);
  let gone = false;
  try {
    await scope.webhooks.endpoints.retrieve(endpoint.id);
  } catch (err) {
    gone = err instanceof NotFoundError;
  }
  check(gone, "webhooks.endpoints.delete (retrieve then 404s)");

  // A 404 carries a request id and is an AuthHttpError (= APIError).
  try {
    await admin.apps.retrieve("00000000-0000-0000-0000-000000000000");
    check(false, "apps.retrieve(missing) should 404");
  } catch (err) {
    check(err instanceof NotFoundError && err instanceof AuthHttpError && err instanceof APIError, "404 is NotFoundError, AuthHttpError and APIError");
    check(typeof err.requestId === "string" && err.requestId.length > 0, `404 carries requestId (${err.requestId})`);
  }

  // Raw response access.
  const { data, response, requestId } = await scope.endUsers.retrieve(profile.id).withResponse();
  check(data.id === profile.id && response.status === 200 && requestId === response.headers.get("x-request-id"), "withResponse()");
} catch (err) {
  failures += 1;
  console.error(`FAIL unexpected: ${err?.name} ${err?.status ?? ""} ${err?.code ?? ""} ${err?.message}`);
} finally {
  if (appId) {
    try {
      await admin.apps.delete(appId);
      console.log(`deleted ${TAG}`);
    } catch (err) {
      failures += 1;
      console.error(`FAIL could not delete ${TAG}: ${err?.status} ${err?.message}`);
    }
  }
  await throttled(`${PLATFORM}/v1/auth/logout-current`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
}
console.log(failures ? `${failures} failure(s)` : "live smoke passed");
process.exit(failures ? 1 : 0);

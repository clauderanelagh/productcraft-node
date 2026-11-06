#!/usr/bin/env node
// Live smoke for @productcraft/trawl against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/trawl.mjs                       uses packages/trawl/dist (run `pnpm run build` first)
//   TRAWL_SDK=/abs/path/to/dist/index.js node …       uses another build (e.g. the published package)
//
// Credentials: signs in to platform-auth as [platform_auth.clauderanelagh] from
// ~/.secrets.toml (read here, never printed) and uses the session as a bearer
// token; logs out in `finally`. It changes no workspace settings, services,
// keys or policies. Every resource it makes is tagged `sdk-smoke-<ts>` (jobs at the
// end of their description, as `[sdk-smoke-<ts>]`); it first
// cancels/deletes stale `sdk-smoke-*` resources a killed run left behind. Jobs
// have no delete: the script cancels its own (one runs to completion: a few credits).
// All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.TRAWL_SDK ?? new URL("../../packages/trawl/dist/index.js", import.meta.url).href;
const { Trawl, NotFoundError, BadRequestError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const PLATFORM = "https://api.platform-auth.productcraft.co";
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

async function signOut(token) {
  await throttled(`${PLATFORM}/v1/auth/logout-current`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {
    console.log("FAIL logout-current");
  });
}

const token = await signIn();
const created = { jobs: [], endpoints: [] };
let trawl;
try {
  const ws = await (await throttled(`${PLATFORM}/v1/workspaces/${WORKSPACE}`, { headers: { authorization: `Bearer ${token}` } })).json();
  check(typeof ws.id === "string", `resolved workspace ${WORKSPACE}`);

  // A fetch whose first job create "loses" the response after the server has
  // handled it, so the SDK must retry with the same Idempotency-Key.
  const creates = [];
  let dropNextCreate = false;
  const fetchWithDrop = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isCreate = method === "POST" && /\/jobs$/.test(new URL(url).pathname);
    if (isCreate) creates.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("idempotency-key"));
    const res = await throttled(input, init);
    if (isCreate && dropNextCreate) {
      dropNextCreate = false;
      throw new TypeError("fetch failed (dropped by sdk-smoke after the server answered)");
    }
    return res;
  };
  trawl = new Trawl({ auth: { type: "bearer", token }, workspaceId: ws.id, fetch: fetchWithDrop });

  // Stale resources from killed runs.
  let swept = 0;
  for (const status of ["queued", "running"]) {
    for (const job of await trawl.jobs.list({ status, limit: 50 }).toArray({ maxItems: 200 })) {
      if (job.description.includes(`[${PREFIX}`)) {
        await trawl.jobs.cancel(job.id).catch(() => undefined);
        swept += 1;
      }
    }
  }
  for await (const ep of trawl.webhooks.endpoints.list()) {
    if (ep.description?.startsWith(PREFIX)) {
      await trawl.webhooks.endpoints.delete(ep.id);
      swept += 1;
    }
  }
  console.log(`swept ${swept} stale ${PREFIX}* resources`);

  // A webhook endpoint (disabled, so nothing is delivered), retrieved then deleted.
  const ep = await trawl.webhooks.endpoints.create({ url: "https://example.com/sdk-smoke", description: TAG, enabled: false, event_types: ["job.succeeded"] });
  created.endpoints.push(ep.id);
  check(typeof ep.signing_secret === "string" && ep.signing_secret.length > 0, "webhooks.endpoints.create returns the signing secret once");
  const epAgain = await trawl.webhooks.endpoints.retrieve(ep.id);
  check(epAgain.description === TAG && epAgain.enabled === false, "webhooks.endpoints.retrieve");

  // create, through a dropped response: one job, the retry reuses the key and is a replay.
  dropNextCreate = true;
  const schema = { type: "object", properties: { title: { type: "string" } }, required: ["title"] };
  const { data: job, response } = await trawl.jobs
    .create({ description: `Cancelled before it runs. [${TAG}]`, json_schema: schema, suggested_urls: ["https://example.com"], max_steps: 2 })
    .withResponse();
  created.jobs.push(job.id);
  check(creates.length === 2 && creates[0] && creates[0] === creates[1], `retried create reused its Idempotency-Key (${creates.length} attempts)`);
  check(response.headers.get("idempotent-replay") === "true", "the retry was answered as an idempotent replay");

  // retrieve + lastResponse + X-Request-Id echo.
  const again = await trawl.jobs.retrieve(job.id);
  check(again.id === job.id && typeof again.lastResponse.requestId === "string" && again.lastResponse.requestId.length > 0, "jobs.retrieve carries lastResponse.requestId");
  const rid = `${TAG}-rid`;
  const echoed = await trawl.jobs.retrieve(job.id, { headers: { "X-Request-Id": rid } });
  check(echoed.lastResponse.requestId === rid, "X-Request-Id sent by the caller is echoed back");
  const { requestId, rateLimit } = await trawl.jobs.retrieve(job.id).withResponse();
  check(typeof requestId === "string" && requestId.length > 0, `withResponse() gives requestId (rateLimit ${rateLimit ? "parsed" : "absent"})`);

  const cancelled = await trawl.jobs.cancel(job.id);
  check(cancelled.status === "cancelled", "jobs.cancel");

  // list: for await over more than one page.
  let pages = 0;
  for await (const page of trawl.jobs.list({ limit: 1 }).pages()) {
    pages += 1;
    if (pages >= 3) break;
  }
  const seen = [];
  for await (const j of trawl.jobs.list({ limit: 1 })) {
    seen.push(j.id);
    if (seen.length >= 3) break;
  }
  check(pages >= 2 && seen.length >= 2 && new Set(seen).size === seen.length, `jobs.list({ limit: 1 }) walks ${seen.length} items over ${pages} pages`);

  // Expected errors.
  try {
    await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000");
    check(false, "404 throws");
  } catch (err) {
    check(err instanceof NotFoundError && !!err.requestId && !!err.docUrl, `404 is NotFoundError (code ${err.code}, requestId and docUrl set)`);
  }
  try {
    await trawl.jobs.create({ json_schema: schema });
    check(false, "400 throws");
  } catch (err) {
    check(err instanceof BadRequestError && err.errors.length > 0, `400 is BadRequestError with errors[] (${err.errors?.map((e) => e.param).join(", ")})`);
  }

  // createAndPoll<T>: a small real extraction.
  const done = await trawl.jobs.createAndPoll(
    { description: `Extract the page title (the main heading) of example.com. [${TAG}]`, json_schema: schema, suggested_urls: ["https://example.com"], max_steps: 8, timeout_s: 240 },
    { timeoutMs: 300_000, intervalMs: 3_000 },
  );
  created.jobs.push(done.id);
  check(["succeeded", "failed", "cancelled"].includes(done.status), `createAndPoll reached ${done.status}${done.result ? ` with result.title=${JSON.stringify(done.result.title)}` : done.error ? ` (${done.error})` : ""}`);
  check(done.status === "succeeded" && typeof done.result?.title === "string", "createAndPoll result is typed data");
} finally {
  if (trawl) {
    for (const id of created.endpoints) await trawl.webhooks.endpoints.delete(id).then(() => console.log(`deleted endpoint ${TAG}`), () => console.log("FAIL delete endpoint"));
    for (const id of created.jobs) {
      const j = await trawl.jobs.retrieve(id).catch(() => undefined);
      if (j && !["succeeded", "failed", "cancelled"].includes(j.status)) await trawl.jobs.cancel(id).catch(() => undefined);
    }
  }
  await signOut(token);
}
console.log(failures === 0 ? "live smoke: all checks passed" : `live smoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

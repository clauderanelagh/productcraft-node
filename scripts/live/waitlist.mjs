#!/usr/bin/env node
// Live smoke for @productcraft/waitlist against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/waitlist.mjs                   uses packages/waitlist/dist (run `pnpm run build` first)
//   WAITLIST_SDK=/abs/path/to/dist/index.js node …   uses another build (e.g. the published package)
//
// Credentials: signs in to platform-auth as [platform_auth.clauderanelagh] from
// ~/.secrets.toml (read here, never printed) and uses the session as a bearer
// token; logs out in `finally`. It changes no workspace settings, services,
// keys or policies. Its one resource is a waitlist with slug `sdk-smoke-<ts>`
// (deleted in `finally`, entries with it); it first deletes stale `sdk-smoke-*`
// waitlists a killed run left behind. Signups use only the Amazon SES mailbox
// simulator (success+<n>@simulator.amazonses.com), through the keyless public
// scope, which must send no Authorization header.
// All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.WAITLIST_SDK ?? new URL("../../packages/waitlist/dist/index.js", import.meta.url).href;
const { Waitlist, NotFoundError, BadRequestError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;

const res_ok = (csv) => csv.split("\n")[0].includes(",") && csv.split("\n").filter(Boolean).length >= 4;
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
let waitlist;
let listId;
try {
  const ws = await (await throttled(`${PLATFORM}/v1/workspaces/${WORKSPACE}`, { headers: { authorization: `Bearer ${token}` } })).json();
  check(typeof ws.id === "string", `resolved workspace ${WORKSPACE}`);
  waitlist = new Waitlist({ auth: { type: "bearer", token }, workspaceId: ws.id, fetch: throttled });

  // Stale resources from killed runs.
  let swept = 0;
  for (const l of await waitlist.lists.list({ limit: 50 }).toArray({ maxItems: 500 })) {
    if (l.slug.startsWith(PREFIX)) {
      await waitlist.lists.delete(l.id);
      swept += 1;
    }
  }
  console.log(`swept ${swept} stale ${PREFIX}* waitlists`);

  // lists.create / retrieve / updateStatus.
  const wl = await waitlist.lists.create({ display_name: "SDK smoke", slug: TAG });
  listId = wl.id;
  check(wl.slug === TAG && typeof wl.id === "string", `lists.create (${wl.status})`);
  check(typeof wl.lastResponse.requestId === "string" && wl.lastResponse.requestId.length > 0, "lists.create carries lastResponse.requestId");
  const active = await waitlist.lists.updateStatus(wl.id, { status: "active" });
  check(active.status === "active" && active.accepting_signups === true, "lists.updateStatus active, accepting signups");
  const { data: again, requestId } = await waitlist.lists.retrieve(wl.id).withResponse();
  check(again.id === wl.id && typeof requestId === "string" && requestId.length > 0, "lists.retrieve().withResponse() gives data and requestId");

  // Keyless public scope: no Authorization header may leave the process.
  const publicHeaders = [];
  const publicFetch = async (input, init) => {
    publicHeaders.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)));
    return throttled(input, init);
  };
  const form = new Waitlist({ fetch: publicFetch }).public({ workspace: WORKSPACE, waitlist: TAG });
  const info = await form.info.retrieve();
  check(info.slug === TAG, "public info.retrieve without a key");
  const entryIds = [];
  for (const n of [1, 2, 3]) {
    const e = await form.entries.create({ email: `success+${TAG}-${n}@simulator.amazonses.com`, name: `SDK smoke ${n}` });
    // Simulator addresses are stored as test entries (negative position, left out of counts and exports by default).
    check(typeof e.id === "string" && e.is_test === true && e.position < 0, `public entries.create #${n} (test entry, position ${e.position})`);
    entryIds.push(e.id);
  }
  check(publicHeaders.length === 4 && publicHeaders.every((h) => !h.has("authorization")), "public calls sent no Authorization header");
  check(!!publicHeaders[1].get("idempotency-key") && !publicHeaders[0].has("idempotency-key"), "public submit carries an Idempotency-Key (spec-declared), the read none");
  const { data: top } = await form.leaderboard.list();
  check(Array.isArray(top), `public leaderboard.list (${top.length} rows)`);

  // for await across pages.
  const emails = [];
  for await (const e of waitlist.lists.entries.list(wl.id, { limit: 1 })) emails.push(e.email);
  check(emails.length === 3 && new Set(emails).size === 3, `lists.entries.list({ limit: 1 }) walks ${emails.length} entries across pages`);
  const { count } = await waitlist.lists.entries.count(wl.id, { include_test: true });
  check(count === 3, `lists.entries.count({ include_test: true }) (${count})`);
  const { count: real } = await waitlist.lists.entries.count(wl.id);
  check(real === 0, `lists.entries.count leaves test entries out (${real})`);
  const csv = await (await waitlist.lists.entries.export(wl.id, { include_test: true })).text();
  check(res_ok(csv), `lists.entries.export({ include_test: true }) returns CSV text (${csv.split("\n").filter(Boolean).length - 1} rows)`);

  // Bulk: a failed row carries the string error code, like a thrown error.
  const bulk = await waitlist.lists.entries.bulk(wl.id, { ids: [entryIds[0], "00000000-0000-4000-8000-000000000000"], action: "reject" });
  const bad = bulk.results.find((r) => r.status === "error");
  check(bulk.succeeded === 1 && bulk.failed === 1 && bad?.error?.code === "NOT_FOUND" && bad.error.status_code === 404,
    `lists.entries.bulk row error is { code: ${JSON.stringify(bad?.error?.code)}, status_code: ${bad?.error?.status_code} }`);

  // The reference example's range (until after since) is a valid call.
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const timeline = await waitlist.lists.analytics.timeline(wl.id, { since, until: new Date().toISOString(), include_test: true });
  check(Array.isArray(timeline.points) && timeline.points.length >= 7, `lists.analytics.timeline with since < until (${timeline.points?.length} days)`);

  // Expected errors.
  try {
    await waitlist.lists.retrieve("00000000-0000-0000-0000-000000000000");
    check(false, "404 throws");
  } catch (err) {
    check(err instanceof NotFoundError && !!err.requestId && !!err.docUrl, `404 is NotFoundError (code ${err.code}, requestId and docUrl set)`);
  }
  try {
    await waitlist.lists.create({ display_name: "", slug: "Not A Slug!" });
    check(false, "400 throws");
  } catch (err) {
    check(err instanceof BadRequestError && err.errors.length > 0, `400 is BadRequestError with errors[] (${err.errors?.map((e) => e.param).join(", ")})`);
  }
} finally {
  if (waitlist && listId) {
    await waitlist.lists.delete(listId).then(() => console.log(`deleted waitlist ${TAG}`), (e) => console.log(`FAIL delete waitlist: ${e?.message}`));
    await waitlist.lists.retrieve(listId).then(
      () => check(false, "waitlist gone after delete"),
      (err) => check(err instanceof NotFoundError, "waitlist gone after delete"),
    );
  }
  await signOut(token);
}
console.log(failures === 0 ? "live smoke: all checks passed" : `live smoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

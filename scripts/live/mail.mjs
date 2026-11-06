#!/usr/bin/env node
// Live smoke for @productcraft/mail against production, in the
// testing-environment workspace (docs/sdk-standard.md section 10).
//
//   node scripts/live/mail.mjs                       uses packages/mail/dist (run `pnpm run build` first)
//   MAIL_SDK=/abs/path/to/dist/index.js node …       uses another build (e.g. the published package)
//
// Credentials: signs in to platform-auth as [platform_auth.clauderanelagh] from
// ~/.secrets.toml (read here, never printed) and uses the session as a bearer
// token; logs out in `finally`. It changes no workspace settings, services,
// keys or policies. Every resource it makes is named `sdk-smoke-<ts>`; it first
// deletes stale `sdk-smoke-*` templates a killed run left behind. Mail goes
// only to the Amazon SES mailbox simulator (success@simulator.amazonses.com),
// from the workspace's first active sending domain (the standing
// sdk-live.productcraft.co; the script never creates or changes domains).
// All traffic goes through a throttle: at most 4 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SDK = process.env.MAIL_SDK ?? new URL("../../packages/mail/dist/index.js", import.meta.url).href;
const { Mail, NotFoundError, BadRequestError } = await import(SDK.startsWith("/") ? pathToFileURL(SDK).href : SDK);
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;
const TO = "success@simulator.amazonses.com";

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
const created = { templates: [] };
let mail;
try {
  const ws = await (await throttled(`${PLATFORM}/v1/workspaces/${WORKSPACE}`, { headers: { authorization: `Bearer ${token}` } })).json();
  check(typeof ws.id === "string", `resolved workspace ${WORKSPACE}`);

  // A fetch that "loses" the response of the next send after the server has
  // handled it, so the SDK must retry with the same Idempotency-Key.
  const sends = [];
  let dropNextSend = false;
  const fetchWithDrop = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isSend = method === "POST" && /\/(emails|templates\/[^/]+\/send)$/.test(new URL(url).pathname);
    if (isSend) sends.push(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("idempotency-key"));
    const res = await throttled(input, init);
    if (isSend && dropNextSend) {
      dropNextSend = false;
      throw new TypeError("fetch failed (dropped by sdk-smoke after the server answered)");
    }
    return res;
  };
  mail = new Mail({ auth: { type: "bearer", token }, workspaceId: ws.id, fetch: fetchWithDrop });

  // Stale resources from killed runs.
  let swept = 0;
  for (const t of await mail.templates.list({ limit: 50 }).toArray({ maxItems: 500 })) {
    if (t.name.startsWith(PREFIX)) {
      await mail.templates.delete(t.name);
      swept += 1;
    }
  }
  console.log(`swept ${swept} stale ${PREFIX}* templates`);

  // domains.list().withResponse() and domains.poll on an active domain.
  const { data: domainsPage, requestId: listRequestId } = await mail.domains.list().withResponse();
  const domain = domainsPage.data.find((d) => d.status === "active" && d.capabilities?.sending === "enabled");
  check(typeof listRequestId === "string" && listRequestId.length > 0, "domains.list().withResponse() gives requestId");
  if (!domain) throw new Error("testing-environment has no active sending domain (sdk-live.productcraft.co is the standing one)");
  const polled = await mail.domains.poll(domain.id, { intervalMs: 2_000, timeoutMs: 20_000 });
  check(polled.status === "active", `domains.poll resolves at a terminal status (${polled.status})`);
  const from = `SDK smoke <sdk-smoke@${domain.name}>`;

  // Template: create, retrieve, list.
  const tpl = await mail.templates.create({ name: TAG, subject: "sdk-smoke {{first_name}}", body_html: "<p>Hello {{first_name}}</p>", tags: ["sdk-smoke"] });
  created.templates.push(TAG);
  check(tpl.name === TAG, "templates.create");
  const tplAgain = await mail.templates.retrieve(TAG);
  check(tplAgain.name === TAG && typeof tplAgain.lastResponse.requestId === "string" && tplAgain.lastResponse.requestId.length > 0, "templates.retrieve carries lastResponse.requestId");

  // emails.send through a dropped response: the retry reuses the key and is a replay.
  dropNextSend = true;
  sends.length = 0;
  const { data: email, response: emailRes } = await mail.emails
    .send({ from, to: TO, subject: `sdk-smoke ${TAG}`, html: "<p>ok</p>", tags: [{ name: "source", value: "sdk-smoke" }] })
    .withResponse();
  check(typeof email.id === "string", "emails.send accepted");
  check(sends.length === 2 && !!sends[0] && sends[0] === sends[1], `emails.send retry reused its Idempotency-Key (${sends.length} attempts)`);
  check(emailRes.headers.get("idempotent-replay") === "true", "emails.send retry answered as an idempotent replay");

  // templates.send through a dropped response, same proof.
  dropNextSend = true;
  sends.length = 0;
  const { data: tsend, response: tsendRes } = await mail.templates.send(TAG, { from, to: TO, data: { first_name: "Ada" } }).withResponse();
  check(tsend !== undefined, "templates.send accepted");
  check(sends.length === 2 && !!sends[0] && sends[0] === sends[1], `templates.send retry reused its Idempotency-Key (${sends.length} attempts)`);
  check(tsendRes.headers.get("idempotent-replay") === "true", "templates.send retry answered as an idempotent replay");

  const emailAgain = await mail.emails.retrieve(email.id);
  check(emailAgain.id === email.id, "emails.retrieve");

  // messages.list: for await over more than one page.
  const seen = [];
  for await (const m of mail.messages.list({ limit: 1 })) {
    seen.push(m.id);
    if (seen.length >= 3) break;
  }
  check(seen.length >= 2 && new Set(seen).size === seen.length, `messages.list({ limit: 1 }) walks ${seen.length} items across pages`);
  const tplSeen = [];
  for await (const t of mail.templates.list({ limit: 1 })) {
    tplSeen.push(t.name);
    if (tplSeen.length >= 2) break;
  }
  check(tplSeen.length === 2, "templates.list({ limit: 1 }) walks two pages");

  // messages.export resolves to the raw Response (CSV).
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const csv = await (await mail.messages.export({ created_after: since, recipient: TO })).text();
  check(csv.split("\n")[0].includes(",") , `messages.export returns CSV text (${csv.split("\n").filter(Boolean).length - 1} rows)`);

  // Expected errors.
  try {
    await mail.domains.retrieve("00000000-0000-0000-0000-000000000000");
    check(false, "404 throws");
  } catch (err) {
    check(err instanceof NotFoundError && !!err.requestId && !!err.docUrl, `404 is NotFoundError (code ${err.code}, requestId and docUrl set)`);
  }
  try {
    await mail.emails.send({ from: "not-an-address", to: TO });
    check(false, "400 throws");
  } catch (err) {
    check(err instanceof BadRequestError && err.errors.length > 0, `400 is BadRequestError with errors[] (${err.errors?.map((e) => e.param).join(", ")})`);
  }
} finally {
  if (mail) {
    for (const name of created.templates) {
      await mail.templates.delete(name).then(() => console.log(`deleted template ${name}`), () => console.log("FAIL delete template"));
      await mail.templates.retrieve(name).then(
        () => check(false, "template gone after delete"),
        (err) => check(err instanceof NotFoundError, "template gone after delete"),
      );
    }
  }
  await signOut(token);
}
console.log(failures === 0 ? "live smoke: all checks passed" : `live smoke: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

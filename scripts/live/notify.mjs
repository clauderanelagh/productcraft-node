#!/usr/bin/env node
// Live smoke for @productcraft/notify against production, in the testing-environment workspace
// (docs/sdk-standard.md section 10, task 017).
//
//   node scripts/live/notify.mjs                     uses packages/notify/dist (run `pnpm run build` first)
//   NOTIFY_SDK=/abs/path/to/dist/index.js node …     uses another build (e.g. the published package)
//
// Credentials: signs in to platform-auth as [platform_auth.clauderanelagh] from ~/.secrets.toml
// (read here, never printed) and uses the session as a bearer token; logs out in `finally`.
// It sweeps stale `sdk-smoke-*` resources a killed run left behind, then creates a throwaway Mail
// template, a category (created, read and deleted on its own: a type that references a category
// keeps it in use even archived, and types cannot be deleted, so the type uses one standing
// category `sdk-live-notify`) and a notification type (inbox + email), identifies recipient `sdk-smoke-<ts>` with the SES simulator address
// success@simulator.amazonses.com, sends, polls the email delivery to `sent`/`delivered`, mints a
// recipient token, reads the inbox through `notify.client({ token })` (which must send only that
// token), marks the item read, and in `finally` erases the recipient, archives the type and
// deletes the Mail template. When testing-environment has no Mail default sender, it sets one on
// the standing sending domain for the run and clears it in `finally`; it changes no other
// workspace setting. The recipient token is never printed. At most about 3 requests per second.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const load = async (env, pkg) => {
  const p = process.env[env] ?? new URL(`../../packages/${pkg}/dist/index.js`, import.meta.url).href;
  return import(p.startsWith("/") ? pathToFileURL(p).href : p);
};
const { Notify } = await load("NOTIFY_SDK", "notify");
const { Mail } = await load("MAIL_SDK", "mail");
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;
const TO = "success@simulator.amazonses.com";
const STANDING_CATEGORY = "sdk-live-notify";

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// <= ~3 req/s across everything this script sends. `seen` records the client-scope requests.
let last = 0;
const seen = [];
const throttled = async (input, init) => {
  const wait = last + 350 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  return fetch(input, init);
};
const recording = async (input, init) => {
  const req = new Request(input, init);
  seen.push({ url: req.url, auth: req.headers.get("authorization") });
  return throttled(req);
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

const session = await signIn();
const opts = { auth: { type: "bearer", token: session }, workspaceId: WORKSPACE, fetch: throttled, maxRetries: 1 };
const notify = new Notify(opts);
const mail = new Mail(opts);
const made = { template: null, category: null, type: null, recipient: null, sender: false };
try {
  // Sweep what a killed run left behind.
  for await (const r of notify.recipients.list({ limit: 100 })) {
    if (r.external_id.startsWith(PREFIX)) await notify.recipients.delete(r.external_id).then(() => console.log(`     swept recipient ${r.external_id}`));
  }
  for await (const t of notify.notificationTypes.list({ limit: 100, include_archived: true })) {
    if (!t.key.startsWith(PREFIX)) continue;
    if (!t.archived_at) await notify.notificationTypes.archive(t.id).then(() => console.log(`     archived stale type ${t.key}`));
  }
  for await (const c of notify.categories.list({ limit: 100 })) {
    if (c.key.startsWith(PREFIX)) await notify.categories.delete(c.id).then(() => console.log(`     swept category ${c.key}`), (e) => console.log(`     stale category ${c.key} kept (${e.code})`));
  }
  for (const t of await mail.templates.list({ limit: 50 }).toArray({ maxItems: 500 })) {
    if (t.name.startsWith(PREFIX)) await mail.templates.delete(t.name).then(() => console.log(`     swept Mail template ${t.name}`));
  }

  // Email goes out through Mail with the workspace default sender. When testing-environment has
  // none, set one on its standing sending domain for this run and clear it again in `finally`.
  const defaults = await mail.sendingDefaults.retrieve();
  if (!defaults.default_sender) {
    const domain = (await mail.domains.list()).data.find((d) => d.status === "active" && d.capabilities?.sending === "enabled");
    if (!domain) throw new Error("testing-environment has no active sending domain");
    await mail.sendingDefaults.update({ address: `SDK smoke <sdk-smoke@${domain.name}>` });
    made.sender = true;
    console.log(`     set a temporary Mail default sender on ${domain.name} (cleared in finally)`);
  }

  made.template = (await mail.templates.create({ name: TAG, subject: "sdk-smoke {{title}}", body_html: "<p>{{title}}</p>", tags: ["sdk-smoke"] })).name;
  check(made.template === TAG, `created Mail template ${TAG}`);

  made.category = await notify.categories.create({ key: TAG, name: "SDK smoke" });
  check(made.category.key === TAG && (await notify.categories.retrieve(made.category.id)).key === TAG, "categories.create + retrieve");
  await notify.categories.delete(made.category.id);
  made.category = null;
  check(true, "categories.delete");

  // The type needs a category, and a category stays in use by its archived types for good, so the
  // type uses one standing category, created on the first run and reused after.
  const standing = (await notify.categories.list({ limit: 100 }).toArray({ maxItems: 500 })).find((c) => c.key === STANDING_CATEGORY) ?? (await notify.categories.create({ key: STANDING_CATEGORY, name: "SDK live smoke (standing)" }));
  made.type = await notify.notificationTypes.create({ key: TAG, name: "SDK smoke", category_key: standing.key, routing: { always: ["inbox", "email"], fallback: [] } });
  check(made.type.key === TAG, "notificationTypes.create (inbox + email)");
  await notify.notificationTypes.templates.update(made.type.id, "inbox", "en", { body: { title: "Smoke {{title}}", body: "Hello from the SDK smoke." } });
  await notify.notificationTypes.templates.update(made.type.id, "email", "en", { body: { mail_template_name: TAG } });
  check(true, "notificationTypes.templates.update (inbox, email)");

  // Notify learns whether Mail can send from GET /setup-status (cached 5 min, and only probed once
  // an active type has an email template): read it now, so a stale "missing" fact from a run
  // without a sender does not skip the email.
  const setup = await notify.setupStatus.retrieve();
  const failing = setup.rows.filter((r) => r.state !== "pass" && r.state !== "not_set").map((r) => `${r.id}:${r.state}`);
  check(failing.length === 0, `setupStatus.retrieve (${setup.rows.map((r) => `${r.id}:${r.state}`).join(", ")})`);

  made.recipient = (await notify.recipients.identify(TAG, { email: TO, locale: "en", name: "SDK smoke" })).external_id;
  check(made.recipient === TAG, "recipients.identify");

  const sent = await notify.notifications.send({ type: TAG, recipients: [TAG], data: { title: "one" } });
  check(typeof sent.id === "string", `notifications.send accepted (${sent.id})`);

  // Poll the email delivery to a terminal state (3 s apart, 90 s at most).
  let email;
  for (let i = 0; i < 30; i++) {
    const page = await notify.deliveries.list({ notification_id: sent.id });
    email = page.data.find((d) => d.channel === "email");
    if (email && ["sent", "delivered", "failed", "bounced", "skipped"].includes(email.state)) break;
    await sleep(3_000);
  }
  check(!!email && ["sent", "delivered"].includes(email.state), `email delivery reached ${email?.state ?? "nothing"}${email?.reason ? ` (${email.reason})` : ""}`);

  const { token, expires_at } = await notify.recipientTokens.mint({ recipient: TAG, ttl_seconds: 300 });
  check(typeof token === "string" && token.length > 20 && !!expires_at, "recipientTokens.mint");

  // The client scope, as a browser would build it: no API key, only the token.
  const me = new Notify({ fetch: recording, maxRetries: 1, credentialFromEnv: false }).client({ token });
  let item;
  for (let i = 0; i < 10 && !item; i++) {
    const page = await me.inbox.list({ status: "unread" });
    item = page.data[0];
    if (!item) await sleep(2_000);
  }
  check(!!item, "client({ token }).inbox.list shows the item");
  const before = await me.inbox.counts();
  check(before.unread >= 1, `client.inbox.counts unread=${before.unread}`);
  if (item) await me.inbox.mark({ ids: [item.id], action: "read" });
  const after = await me.inbox.counts();
  check(after.unread === before.unread - 1, `client.inbox.mark read -> unread=${after.unread}`);
  check(seen.length > 0 && seen.every((s) => s.auth === `Bearer ${token}` && new URL(s.url).pathname.startsWith("/v1/client/")), `the client scope sent only the recipient token (${seen.length} requests)`);
} catch (err) {
  failures += 1;
  console.log(`FAIL ${err?.constructor?.name ?? "Error"}: ${err?.status ?? ""} ${err?.code ?? ""} ${err?.message ?? err}`);
} finally {
  const step = (what, p) => p.then(() => console.log(`     cleaned ${what}`), (e) => { failures += 1; console.log(`FAIL cleanup ${what}: ${e?.status ?? ""} ${e?.code ?? e?.message}`); });
  if (made.recipient) await step(`recipient ${made.recipient} (erased)`, notify.recipients.delete(made.recipient));
  if (made.type) await step(`type ${made.type.key} (archived)`, notify.notificationTypes.archive(made.type.id));
  if (made.category) await step(`category ${made.category.key}`, notify.categories.delete(made.category.id));
  if (made.template) await step(`Mail template ${made.template}`, mail.templates.delete(made.template));
  if (made.sender) await step("temporary Mail default sender (cleared)", mail.sendingDefaults.update({ address: null }));
  const out = await fetch(`${PLATFORM}/v1/auth/logout-current`, { method: "POST", headers: { authorization: `Bearer ${session}` } });
  console.log(`     logged out (${out.status})`);
}
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);

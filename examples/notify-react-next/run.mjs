#!/usr/bin/env node
// The Next.js App Router fixture and live check for @productcraft/notify-react (task 020).
//
//   node run.mjs --local --build-only   CI fixture: `next build` with the workspace packages packed as tarballs.
//                                       app/page.tsx is a Server Component that renders <NotifyInbox/> and
//                                       <NotifyPreferences/> directly, so the build fails without "use client".
//   node run.mjs                        live, with the published npm packages
//   node run.mjs --local                live, with the workspace packages (build them first)
//
// Live runs use production, testing-environment only. They sign in as [platform_auth.clauderanelagh]
// from ~/.secrets.toml (read here, never printed), create a throwaway inbox notification type
// `sdk-smoke-<ts>` (in the standing category `sdk-live-notify`) and recipient `sdk-smoke-<ts>`, send
// one notification, build and start this app with the session in the server's environment only (the
// token route mints recipient tokens with it; the browser never sees it), then in headless Chromium:
// the bell shows the unread count, a second send arrives over the real-time stream, an action button
// records its press, mark all read clears the count, and a preference switch saves one cell (read back
// through the management API, then put back). If the workspace limits client origins and this origin is
// not allowed, it is added for the run and removed in `finally`. In `finally`: close the browser, stop the
// server, delete the scratch app, erase the recipient, archive the type, log out. <= 2 requests/s from Node.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const LOCAL = process.argv.includes("--local");
const BUILD_ONLY = process.argv.includes("--build-only");
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;
const STANDING_CATEGORY = "sdk-live-notify";
const PORT = 4720;
const ORIGIN = `http://localhost:${PORT}`;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. A scratch copy of the app (outside the repo) with its dependencies.
const APP = join(process.env.TMPDIR ?? "/tmp", `notify-react-next-${process.pid}`);
rmSync(APP, { recursive: true, force: true });
mkdirSync(APP, { recursive: true });
for (const f of ["app", "next.config.mjs", "tsconfig.json"]) cpSync(join(HERE, f), join(APP, f), { recursive: true });
const pkg = (await import(pathToFileURL(join(HERE, "package.json")).href, { with: { type: "json" } })).default;
const pinned = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
  .filter(([n]) => !n.startsWith("@productcraft/"))
  .map(([n, v]) => `${n}@${v}`);
const ours = LOCAL
  ? ["core", "notify", "notify-js", "notify-react"].map((p) => {
      const dir = join(ROOT, "packages", p);
      const out = join(APP, ".tarballs");
      mkdirSync(out, { recursive: true });
      const before = new Set(readdirSync(out));
      execFileSync("pnpm", ["pack", "--pack-destination", out], { cwd: dir, stdio: "ignore" });
      return join(out, readdirSync(out).find((f) => !before.has(f)));
    })
  : Object.entries(pkg.dependencies)
      .filter(([n]) => n.startsWith("@productcraft/"))
      .map(([n, v]) => `${n}@${v}`);
writeFileSync(join(APP, "package.json"), JSON.stringify({ name: "notify-react-next-run", private: true }, null, 2));
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", "--loglevel=error", ...pinned, ...ours], { cwd: APP, stdio: "inherit" });
const installed = (n) => JSON.parse(readFileSync(join(APP, "node_modules", n, "package.json"), "utf8")).version;
console.log(`     using ${LOCAL ? "the workspace packages" : "the npm packages"}: notify-react ${installed("@productcraft/notify-react")}, notify-js ${installed("@productcraft/notify-js")}, notify ${installed("@productcraft/notify")}, next ${installed("next")}`);
const next = (args, env = {}, stdio = "inherit") => execFileSync(join(APP, "node_modules/.bin/next"), args, { cwd: APP, stdio, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env } });

if (BUILD_ONLY) {
  try {
    next(["build"]);
    check(true, "next build (App Router): a Server Component renders <NotifyInbox/> and <NotifyPreferences/> from the package");
  } catch {
    check(false, "next build");
  } finally {
    rmSync(APP, { recursive: true, force: true });
  }
  process.exit(failures ? 1 : 0);
}

// 2. Live.
const { Notify } = await import(pathToFileURL(join(APP, "node_modules/@productcraft/notify/dist/index.js")).href);
const { chromium } = await import(pathToFileURL(join(APP, "node_modules/playwright-core/index.mjs")).href);

let last = 0;
const throttled = async (input, init) => {
  const wait = last + 500 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  return fetch(input, init);
};
function credentials() {
  const py = 'import tomllib,json,pathlib;c=tomllib.loads(pathlib.Path.home().joinpath(".secrets.toml").read_text())["platform_auth"]["clauderanelagh"];print(json.dumps({"identifier":c.get("email") or c["username"],"password":c["password"]}))';
  return JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8" }));
}
const signin = await throttled(`${PLATFORM}/v1/auth/signin`, { method: "POST", headers: { "content-type": "application/json", "user-agent": "sdk-smoke" }, body: JSON.stringify({ ...credentials(), sessionDuration: 3600 }) });
if (!signin.ok) throw new Error(`platform sign-in failed: HTTP ${signin.status}`);
const sessionBody = await signin.json();
const session = sessionBody.access_token ?? sessionBody.accessToken;
const notify = new Notify({ auth: { type: "bearer", token: session }, workspaceId: WORKSPACE, fetch: throttled, maxRetries: 1 });
const made = { type: null, recipient: null, origin: null };
let server;
let browser;
try {
  for await (const r of notify.recipients.list({ limit: 100 })) {
    if (r.external_id.startsWith(PREFIX)) await notify.recipients.delete(r.external_id).then(() => console.log(`     swept recipient ${r.external_id}`));
  }
  const settings = await notify.settings.retrieve();
  const origins = settings.client_origins ?? [];
  if (origins.length && !origins.includes(ORIGIN)) {
    await notify.settings.update({ client_origins: [...origins, ORIGIN] });
    made.origin = origins;
    console.log(`     allowed client origin ${ORIGIN} for this run (removed in finally)`);
  }

  const standing = (await notify.categories.list({ limit: 100 }).toArray({ maxItems: 500 })).find((c) => c.key === STANDING_CATEGORY) ?? (await notify.categories.create({ key: STANDING_CATEGORY, name: "SDK live smoke (standing)" }));
  made.type = await notify.notificationTypes.create({ key: TAG, name: "SDK smoke (React)", category_key: standing.key, routing: { always: ["inbox"], fallback: [] } });
  await notify.notificationTypes.templates.update(made.type.id, "inbox", "en", {
    body: {
      title: "Smoke {{title}}",
      body: "Hello **{{title}}** from the [Notify docs](https://productcraft.co/docs/notify).",
      action_url: "https://productcraft.co/docs/notify",
      actions: [{ label: "Accept", action_key: "accept" }, { label: "Open docs", url: "https://productcraft.co/docs/notify" }],
    },
  });
  made.recipient = (await notify.recipients.identify(TAG, { locale: "en", name: "SDK smoke" })).external_id;
  check(made.type.key === TAG && made.recipient === TAG, `throwaway type + recipient ${TAG}`);
  await notify.notifications.send({ type: TAG, recipients: [TAG], data: { title: "one" } });

  next(["build"], {}, ["ignore", "ignore", "inherit"]);
  check(true, "next build");
  server = spawn(join(APP, "node_modules/.bin/next"), ["start", "-p", String(PORT), "-H", "localhost"], {
    cwd: APP,
    stdio: ["ignore", "ignore", "inherit"],
    // The session lives only in the server's environment; the token route uses it to mint.
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NOTIFY_DEMO_BEARER: session, NOTIFY_DEMO_RECIPIENT: TAG, PRODUCTCRAFT_WORKSPACE_ID: WORKSPACE },
  });
  for (let i = 0; i < 60; i++) {
    if (await fetch(ORIGIN).then((r) => r.ok, () => false)) break;
    await sleep(500);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const apiCalls = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().startsWith("https://api.notify.productcraft.co/")) apiCalls.push({ url: r.url(), method: r.method() });
  });
  await page.goto(ORIGIN);
  const bell = page.getByRole("button", { name: /^Notifications, \d+ unread$/ });
  await bell.waitFor({ timeout: 30_000 });
  check(true, `bell: "${await bell.getAttribute("aria-label")}"`);
  await bell.click();
  await page.getByRole("dialog", { name: "Notifications" }).waitFor();
  await page.locator(".pcn-item", { hasText: "Smoke one" }).waitFor({ timeout: 15_000 });
  check(true, "inbox popover lists the first item (rendered Markdown: " + JSON.stringify(await page.locator(".pcn-item .pcn-body strong").first().textContent()) + ")");
  check((await page.locator(".pcn-item .pcn-body a").first().getAttribute("href")) === "https://productcraft.co/docs/notify", "Markdown link kept (https)");

  // Real time: a send while the popover is open arrives over the stream.
  await sleep(1_500);
  await notify.notifications.send({ type: TAG, recipients: [TAG], data: { title: "two" } });
  await page.locator(".pcn-item", { hasText: "Smoke two" }).waitFor({ timeout: 20_000 });
  check(true, "second send arrived live (SSE) without a reload");
  check((await page.locator(".pcn-sr[aria-live]").textContent())?.includes("Smoke two"), "new item announced in the live region");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT.replace(/\.png$/, "-inbox.png") });

  const pressed = page.waitForResponse((r) => r.url().endsWith("/interact") && r.request().method() === "POST", { timeout: 15_000 });
  await page.locator(".pcn-item", { hasText: "Smoke two" }).getByRole("button", { name: "Accept" }).click();
  const press = await pressed;
  const pressBody = await press.json().catch(() => ({}));
  check(press.status() === 200 && pressBody.interaction_key === "accept" && !!pressBody.interacted_at, `action button recorded the press (HTTP ${press.status()}, interaction_key ${pressBody.interaction_key})`);

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.getByRole("button", { name: "Notifications", exact: true }).waitFor({ timeout: 10_000 });
  check(true, "mark all as read: the bell reads \"Notifications\" (0 unread)");
  await page.keyboard.press("Escape");

  // Preference centre: the standing category's email switch saves one cell.
  const sw = page.getByRole("switch", { name: `${standing.name}: In-app` });
  await sw.waitFor({ timeout: 15_000 });
  const was = await sw.isChecked();
  await sw.click();
  await page.waitForFunction(([label, v]) => document.querySelector(`[aria-label="${label}"]`)?.checked === v, [`${standing.name}: In-app`, !was]);
  await sleep(1_500);
  const server1 = await notify.recipients.preferences.retrieve(TAG);
  const cell = server1.preferences.find((p) => p.scope === "category" && p.key === standing.key && p.channel === "inbox");
  check(!!cell && cell.enabled === !was, `preference cell saved (server: ${JSON.stringify(cell ?? null)})`);
  await sw.click();
  await page.waitForFunction(([label, v]) => document.querySelector(`[aria-label="${label}"]`)?.checked === v, [`${standing.name}: In-app`, was]);
  await sleep(1_500);
  const server2 = await notify.recipients.preferences.retrieve(TAG);
  check(!server2.preferences.some((p) => p.scope === "category" && p.key === standing.key && p.channel === "inbox"), "switching back removed the cell (enabled: null)");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  check(storage.local === 0 && storage.session === 0, "no token in Web Storage");
  check(apiCalls.every((c) => !/token=|rt_/.test(new URL(c.url).search)), "no token in API URLs");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
} catch (err) {
  failures += 1;
  console.log(`FAIL ${err?.constructor?.name ?? "Error"}: ${err?.status ?? ""} ${err?.code ?? ""} ${err?.message ?? err}`);
} finally {
  const step = (what, p) => p.then(() => console.log(`     cleaned ${what}`), (e) => { failures += 1; console.log(`FAIL cleanup ${what}: ${e?.status ?? ""} ${e?.code ?? e?.message}`); });
  await browser?.close();
  server?.kill("SIGTERM");
  rmSync(APP, { recursive: true, force: true });
  if (made.recipient) await step(`recipient ${made.recipient} (erased)`, notify.recipients.delete(made.recipient));
  if (made.type) await step(`type ${made.type.key} (archived)`, notify.notificationTypes.archive(made.type.id));
  if (made.origin) await step("client origin (restored)", notify.settings.update({ client_origins: made.origin }));
  const out = await fetch(`${PLATFORM}/v1/auth/logout-current`, { method: "POST", headers: { authorization: `Bearer ${session}` } });
  console.log(`     logged out (${out.status})`);
}
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);

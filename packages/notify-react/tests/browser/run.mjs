#!/usr/bin/env node
// Headless Chromium against a local mock of the Notify client API with a real SSE stream (the same
// shape as notify-js's browser test): the built @productcraft/notify-react renders the bell, opens the
// popover with the keyboard, keeps focus inside it, closes on Escape, shows a streamed item and its
// action buttons, records a button press, marks all read, and saves one preference cell (mandatory
// cells locked). Default theme loaded; reduced motion honoured.
// Usage (after `pnpm run build`): node tests/browser/run.mjs
// Browser: playwright-core's chromium headless shell (`npx playwright-core install --only-shell chromium`).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "../..");
const bundle = await build({
  entryPoints: [join(PKG, "tests/browser/page.jsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  write: false,
  logLevel: "silent",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@productcraft/notify-react": PKG },
  nodePaths: [join(PKG, "node_modules")],
});
const appJs = bundle.outputFiles[0].text;
const css = readFileSync(join(PKG, "dist/styles.css"), "utf8");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>notify-react</title><link rel="stylesheet" href="/styles.css"><div id="root"></div><script type="module" src="/app.js"></script>`;

let tokenN = 0;
const requests = [];
const streams = [];
const id = (n) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const mk = (n, title, over = {}) => ({ id: id(n), notification_id: id(900 + n), type: "t", category: "comments", tenant: null, title, body: "Hello **there**", action_url: "https://example.com/item", avatar_url: null, actions: [], actor: { external_id: "ada", name: "Ada Lovelace", avatar_url: null }, data: {}, created_at: new Date().toISOString(), seen_at: null, read_at: null, archived_at: null, interacted_at: null, interaction_key: null, retracted_at: null, ...over });
const items = [mk(1, "First")];
let counts = { unseen: 1, unread: 1 };
let prefs = {
  categories: [
    { key: "comments", name: "Comments", description: "Replies and mentions", defaults: { inbox: "on", email: "off", push: "on", webpush: "on" } },
    { key: "security", name: "Security", description: null, defaults: { inbox: "mandatory", email: "mandatory", push: "on", webpush: "on" } },
  ],
  preferences: [],
  unsubscribed_all: false,
  timezone: "Europe/Lisbon",
  quiet_hours: null,
};

const readBody = (req) => new Promise((ok) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => ok(b ? JSON.parse(b) : undefined));
});
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const entry = { method: req.method, url: req.url, auth: req.headers.authorization };
  requests.push(entry);
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (u.pathname === "/") return send(200, html, "text/html");
  if (u.pathname === "/app.js") return send(200, appJs, "text/javascript");
  if (u.pathname === "/styles.css") return send(200, css, "text/css");
  if (u.pathname === "/token") return send(200, `rt_browser_${++tokenN}`, "text/plain");
  if (!/^Bearer rt_browser_\d+$/.test(req.headers.authorization ?? "")) return send(401, { code: "RECIPIENT_TOKEN_INVALID", message: "no token" });
  if (u.pathname === "/v1/client/inbox") return send(200, { data: items, counts, pagination: { next_cursor: null, has_more: false } });
  if (u.pathname === "/v1/client/inbox/mark") {
    entry.body = await readBody(req);
    if (entry.body.action === "read") counts = { unseen: 0, unread: 0 };
    if (entry.body.action === "seen") counts = { ...counts, unseen: 0 };
    return send(200, { updated: 1, counts });
  }
  const interact = /^\/v1\/client\/inbox\/([^/]+)\/interact$/.exec(u.pathname);
  if (interact) {
    entry.body = await readBody(req);
    const it = items.find((i) => i.id === interact[1]);
    return send(200, { ...it, interacted_at: new Date().toISOString(), read_at: new Date().toISOString(), interaction_key: entry.body.action_key ?? null });
  }
  if (u.pathname === "/v1/client/preferences" && req.method === "GET") return send(200, prefs);
  if (u.pathname === "/v1/client/preferences" && req.method === "PATCH") {
    entry.body = await readBody(req);
    for (const c of entry.body.preferences ?? []) {
      prefs.preferences = prefs.preferences.filter((p) => !(p.scope === c.scope && p.key === c.key && p.channel === c.channel));
      if (c.enabled !== null) prefs.preferences.push({ scope: c.scope, key: c.key, channel: c.channel, enabled: c.enabled });
    }
    return send(200, prefs);
  }
  if (u.pathname === "/v1/client/inbox/stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write("retry: 300\n\n");
    res.write(`event: counts\ndata: ${JSON.stringify(counts)}\n\n`);
    streams.push(res);
    return;
  }
  send(404, { code: "NOT_FOUND", message: u.pathname });
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const sse = (event, data, eid) => streams.at(-1).write(`event: ${event}\n${eid ? `id: ${eid}\n` : ""}data: ${JSON.stringify(data)}\n\n`);

const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/");
  const bell = page.getByRole("button", { name: "Notifications, 1 unread" });
  await bell.waitFor();
  assert.equal(await page.locator(".pcn-badge").textContent(), "1");
  await page.waitForFunction(() => document.querySelector(".pcn-switch") !== null);
  console.log("ok   bell with the count in its label, badge, preference table rendered");

  // Keyboard: focus the bell, Enter opens; focus moves into the dialog and Tab stays inside it.
  await bell.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Notifications" });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.querySelector(".pcn-popover").contains(document.activeElement)), true);
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.querySelector(".pcn-popover").contains(document.activeElement)), true, "focus left the dialog");
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".pcn-popover")).animationName), "none", "animates under reduced motion");
  await page.waitForFunction(() => document.querySelectorAll(".pcn-item").length === 1);
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(requests.some((r) => r.url === "/v1/client/inbox/mark" && r.body?.action === "seen"), "opening marks seen");
  console.log("ok   keyboard open, focus trapped, shown items marked seen, no animation under reduced motion");

  // A streamed item with two action buttons appears while open.
  const second = mk(2, "Invite to Acme", { actions: [{ label: "Accept", action_key: "accept", url: "https://example.com/accept" }, { label: "Decline", action_key: "decline" }] });
  items.unshift(second);
  counts = { unseen: 1, unread: 2 };
  sse("item.created", { item: second }, second.id);
  sse("counts", counts);
  await page.waitForFunction(() => document.querySelectorAll(".pcn-item").length === 2);
  await page.getByRole("button", { name: "Notifications, 2 unread" }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__toasts), ["Invite to Acme"]);
  assert.match(await page.locator(".pcn-sr[aria-live]").textContent(), /Invite to Acme/);
  await page.getByRole("button", { name: "Accept" }).click();
  await page.waitForFunction(() => window.__navigated.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__navigated), ["https://example.com/accept"]);
  assert.deepEqual(requests.find((r) => r.url.endsWith("/interact")).body, { action_key: "accept" });
  console.log("ok   streamed item rendered and announced, onNew fired, action button recorded and navigated");

  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.getByRole("button", { name: "Notifications", exact: true }).waitFor();
  assert.equal(await page.locator(".pcn-badge").count(), 0);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("pcn-bell")), true);
  console.log("ok   mark all read cleared the badge; Escape closed and focus returned to the bell");

  const locked = page.getByRole("switch", { name: "Security: Email" });
  assert.equal(await locked.isDisabled(), true);
  const email = page.getByRole("switch", { name: "Comments: Email" });
  assert.equal(await email.isChecked(), false);
  await email.click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Comments: Email"]').checked);
  const patch = requests.filter((r) => r.method === "PATCH");
  assert.deepEqual(patch.map((p) => p.body), [{ preferences: [{ scope: "category", key: "comments", channel: "email", enabled: true }] }]);
  console.log("ok   preference cell saved alone; mandatory cell locked");

  // Viewport collision: the popover stays inside the viewport (16 px gutter) whatever side the bell is on.
  const fits = async (p) => {
    await p.locator(".pcn-bell").click();
    await p.locator(".pcn-popover").waitFor();
    return p.evaluate(() => {
      const r = document.querySelector(".pcn-popover").getBoundingClientRect();
      const b = document.querySelector(".pcn-mark-all").getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { left: r.left, right: r.right, vw: document.documentElement.clientWidth, bellRight: document.querySelector(".pcn-bell").getBoundingClientRect().right, hit: hit?.className ?? null };
    });
  };
  const rightSide = await fits(page);
  assert.ok(Math.abs(rightSide.right - rightSide.bellRight) < 1, `right-aligned bell: popover moved ${JSON.stringify(rightSide)}`);
  assert.equal(rightSide.hit, "pcn-mark-all");
  await page.keyboard.press("Escape");
  for (const width of [1280, 360]) {
    const left = await browser.newPage({ reducedMotion: "reduce", viewport: { width, height: 720 } });
    left.on("pageerror", (e) => errors.push(e.message));
    await left.goto(origin + "/?left");
    const r = await fits(left);
    assert.ok(r.left >= 15.5 && r.right <= r.vw - 15.5, `left-aligned bell at ${width}px: popover off-screen ${JSON.stringify(r)}`);
    assert.equal(r.hit, "pcn-mark-all", `left-aligned bell at ${width}px: Mark all as read not clickable`);
    await left.close();
  }
  console.log("ok   popover stays inside the viewport with the bell on the left (1280 and 360 px) and on the right");

  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }));
  assert.deepEqual(storage, { local: 0, session: 0, cookie: "" });
  for (const r of requests) assert.ok(!r.url.includes("rt_browser"), `token in URL: ${r.url}`);
  assert.deepEqual(errors, []);
  console.log("ok   no token in Web Storage, cookies or URLs; no page errors");
} catch (e) {
  failed = true;
  console.error("FAIL", e);
} finally {
  await browser.close();
  for (const s of streams) s.destroy?.();
  server.closeAllConnections?.();
  server.close();
}
process.exit(failed ? 1 : 0);

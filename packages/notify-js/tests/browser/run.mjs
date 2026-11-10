#!/usr/bin/env node
// Headless Chromium against a local mock of the Notify client API that serves a real SSE stream:
// the built @productcraft/notify-js (bundled with @productcraft/notify, as a browser app would) loads
// the inbox, renders streamed items, marks all read, refreshes its token on auth_expired and reconnects
// with Last-Event-ID, keeps the token out of Web Storage and URLs, and notify-sw.js installs.
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
  entryPoints: [join(PKG, "tests/browser/page.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  logLevel: "silent",
  alias: { "@productcraft/notify-js": PKG },
});
const appJs = bundle.outputFiles[0].text;
const swJs = readFileSync(join(PKG, "dist/notify-sw.js"), "utf8");
const html = `<!doctype html><meta charset="utf-8"><title>notify-js</title><span id="badge">?</span><span id="realtime"></span><ul id="list"></ul><script type="module" src="/app.js"></script>`;

let tokenN = 0;
const requests = [];
const streams = [];
const id = (n) => `0190a000-0000-7000-8000-${String(n).padStart(12, "0")}`;
const mk = (n, title) => ({ id: id(n), notification_id: id(900 + n), type: "t", category: "c", tenant: null, title, body: "b", action_url: null, avatar_url: null, actions: [], actor: null, data: {}, created_at: new Date().toISOString(), seen_at: null, read_at: null, archived_at: null, interacted_at: null, interaction_key: null, retracted_at: null });
const items = [mk(1, "First")];
let counts = { unseen: 1, unread: 1 };

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, lastEventId: req.headers["last-event-id"] });
  const send = (status, body, type = "application/json") => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (u.pathname === "/") return send(200, html, "text/html");
  if (u.pathname === "/app.js") return send(200, appJs, "text/javascript");
  if (u.pathname === "/notify-sw.js") return send(200, swJs, "text/javascript");
  if (u.pathname === "/token") return send(200, `rt_browser_${++tokenN}`, "text/plain");
  if (!/^Bearer rt_browser_\d+$/.test(req.headers.authorization ?? "")) return send(401, { code: "RECIPIENT_TOKEN_INVALID", message: "no token" });
  if (u.pathname === "/v1/client/inbox") return send(200, { data: items, counts, pagination: { next_cursor: null, has_more: false } });
  if (u.pathname === "/v1/client/inbox/mark" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests[requests.length - 1].body = JSON.parse(body);
      counts = { unseen: 0, unread: 0 };
      send(200, { updated: items.length, counts });
    });
    return;
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
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(origin + "/");
  await page.waitForFunction(() => document.getElementById("list").dataset.status === "ready" && document.getElementById("realtime").textContent === "open");
  assert.equal(await page.textContent("#badge"), "1");
  assert.equal(await page.locator("#list li").count(), 1);
  console.log("ok   first page + stream open");

  const second = mk(2, "Second");
  items.unshift(second);
  counts = { unseen: 2, unread: 2 };
  sse("item.created", { item: second }, second.id);
  sse("counts", counts);
  await page.waitForFunction(() => document.querySelectorAll("#list li").length === 2 && document.getElementById("badge").textContent === "2");
  assert.deepEqual(await page.evaluate(() => window.__toasts), ["Second"]);
  console.log("ok   streamed item.created + counts rendered, onNew fired");

  await page.evaluate(() => window.__notify.inbox.markAllRead());
  assert.equal(await page.textContent("#badge"), "0");
  assert.equal(await page.locator('#list li[data-read="1"]').count(), 2);
  assert.deepEqual(requests.find((r) => r.url === "/v1/client/inbox/mark").body, { action: "read", before_id: second.id });
  console.log("ok   markAllRead (before_id) reconciled with server counts");

  const streamsBefore = streams.length;
  sse("auth_expired", { reason: "expired" });
  streams.at(-1).end();
  await page.waitForFunction(() => document.getElementById("realtime").textContent === "open");
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(streams.length > streamsBefore, "reconnected");
  const reconnect = requests.filter((r) => r.url === "/v1/client/inbox/stream").at(-1);
  assert.equal(reconnect.auth, "Bearer rt_browser_2");
  assert.equal(reconnect.lastEventId, second.id);
  console.log("ok   auth_expired → new token, reconnect with Last-Event-ID");

  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }));
  assert.deepEqual(storage, { local: 0, session: 0, cookie: "" });
  for (const r of requests) assert.ok(!r.url.includes("rt_browser"), `token in URL: ${r.url}`);
  console.log("ok   no token in Web Storage, cookies or URLs");

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/notify-sw.js");
    await navigator.serviceWorker.ready;
    return Boolean(reg.active || reg.installing || reg.waiting);
  });
  assert.ok(sw);
  console.log("ok   notify-sw.js installs");
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

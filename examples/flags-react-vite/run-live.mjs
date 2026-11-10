#!/usr/bin/env node
// Live check of the browser build + @productcraft/flags-react (task 019), against production, in the
// testing-environment workspace only:
//
//   node run-live.mjs            the published npm packages
//   LOCAL=1 node run-live.mjs    the workspace builds (packages/flags, packages/flags-react; build them first)
//
// It signs in as [platform_auth.clauderanelagh] from ~/.secrets.toml (read here, never printed), creates
// one throwaway project `sdk-smoke-<ts>` with `show_banner` (on) and `banner_text`, reveals the
// development key into memory, builds this Vite app with it (VITE_FLAGS_SDK_KEY in the child's
// environment only), serves the build on 127.0.0.1, reads the flags in headless Chromium, turns
// `show_banner` off and waits for the page to show it after a reload. In `finally`: closes the browser,
// stops the server, deletes the build output (it holds the key), deletes the project and logs out.
// Nothing printed holds the key. Requests to ProductCraft stay under 2 per second.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const LOCAL = process.env.LOCAL === "1";
const PLATFORM = "https://api.platform-auth.productcraft.co";
const WORKSPACE = "testing-environment";
const PREFIX = "sdk-smoke-";
const TAG = `${PREFIX}${Date.now()}`;
const PORT = 4719;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Dependencies: the npm packages, or the workspace builds linked in their place.
const pinned = ["react@19.3.1", "react-dom@19.3.1", "vite@8.3.7", "@vitejs/plugin-react@6.3.0", "playwright-core@1.58.0"];
// LOCAL=1: a scratch copy of the app (outside the repo) without the npm ranges for our packages, which
// may not be published yet, and the workspace builds linked in their place.
const APP = LOCAL ? join(process.env.TMPDIR ?? "/tmp", `flags-react-vite-local-${process.pid}`) : HERE;
const npm = (args) => execFileSync("npm", [...args, "--no-audit", "--no-fund", "--no-package-lock", "--loglevel=error"], { cwd: APP, stdio: "inherit" });
if (LOCAL) {
  rmSync(APP, { recursive: true, force: true });
  mkdirSync(APP, { recursive: true });
  for (const f of ["index.html", "vite.config.mjs", "src"]) cpSync(join(HERE, f), join(APP, f), { recursive: true });
  writeFileSync(join(APP, "package.json"), JSON.stringify({ name: "flags-react-vite-local", private: true, type: "module" }));
  npm(["install", ...pinned]);
  mkdirSync(join(APP, "node_modules/@productcraft"), { recursive: true });
  for (const p of ["flags", "flags-react"]) symlinkSync(join(ROOT, "packages", p), join(APP, "node_modules/@productcraft", p), "dir");
} else npm(["install"]);
const flagsPkg = join(APP, "node_modules/@productcraft/flags");
const { Flags } = await import(pathToFileURL(join(flagsPkg, "dist/index.js")).href);
const { chromium } = await import(pathToFileURL(join(APP, "node_modules/playwright-core/index.mjs")).href);
console.log(`     using ${LOCAL ? "the workspace builds" : "the npm packages"}`);

// <= 2 req/s across everything this script sends from Node.
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

const res = await throttled(`${PLATFORM}/v1/auth/signin`, {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "sdk-smoke" },
  body: JSON.stringify({ ...credentials(), sessionDuration: 3600 }),
});
if (!res.ok) throw new Error(`platform sign-in failed: HTTP ${res.status}`);
const signin = await res.json();
const token = signin.access_token ?? signin.accessToken;
const flags = new Flags({ auth: { type: "bearer", token }, workspaceId: WORKSPACE, fetch: throttled, maxRetries: 1 });

let project;
let server;
let browser;
try {
  for await (const p of flags.projects.list({ limit: 100 })) {
    if (p.name.startsWith(PREFIX)) {
      await flags.projects.delete(p.id, { confirm: p.name });
      console.log(`     swept stale project ${p.name}`);
    }
  }
  project = await flags.projects.create({ name: TAG, environment_preset: "dev_prod", note: "sdk 019 browser example" });
  const env = project.environments.find((e) => e.key === "development") ?? project.environments[0];
  let configId = project.configs[0]?.id;
  if (!configId) configId = (await flags.projects.configs.create(project.id, { key: "main", name: "Main" })).id;
  const show = await flags.configs.settings.create(configId, { key: "show_banner", type: "boolean", name: "Show banner", initial_value: true });
  await flags.configs.settings.create(configId, { key: "banner_text", type: "string", name: "Banner text", initial_value: "Hello from Flags" });
  check(true, `created project ${TAG} with show_banner and banner_text`);
  const keys = await flags.configs.environments.sdkKeys.reveal(configId, env.id);
  const sdkKey = keys.data[0]?.key;
  check(/^pcf_sdk_[0-9A-Za-z]{38}$/.test(sdkKey ?? ""), "revealed the development SDK key (not printed)");

  // 2. Build the app with the key, and serve it.
  const vite = join(APP, "node_modules/vite/bin/vite.js");
  execFileSync("node", [vite, "build", "--logLevel", "warn"], { cwd: APP, env: { ...process.env, VITE_FLAGS_SDK_KEY: sdkKey }, stdio: ["ignore", "ignore", "inherit"] });
  check(existsSync(join(APP, "dist/index.html")), "vite build");
  server = spawn("node", [vite, "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: APP, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok, () => false)) break;
    await sleep(200);
  }

  // 3. Headless Chromium (the cached headless shell matching playwright-core 1.58).
  const shell = execFileSync("bash", ["-c", "ls -d $HOME/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | sort -V | tail -1"], { encoding: "utf8" }).trim();
  browser = await chromium.launch({ executablePath: shell, headless: true });
  const page = await browser.newPage();
  const downloads = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://api.flags.productcraft.co/v1/configs/")) downloads.push(Object.keys(r.headers()).map((h) => h.toLowerCase()));
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message.replaceAll(sdkKey, "<key>")));
  const read = async () => ({
    ready: await page.textContent("[data-testid=ready]"),
    show: await page.textContent("[data-testid=show_banner]"),
    text: await page.textContent("[data-testid=banner_text]"),
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => document.querySelector("[data-testid=ready]")?.textContent === "true", null, { timeout: 15_000 });
  const first = await read();
  check(first.show === "true" && /^Hello from Flags \((STATIC|CACHED), revision \d+\)$/.test(first.text), `the page reads show_banner = ${first.show}, banner_text = "${first.text}"`);
  check(downloads.length >= 1 && downloads.every((h) => !h.includes("if-none-match")), `the browser downloaded the config ${downloads.length}x with no hand-set If-None-Match`);
  check(pageErrors.length === 0, `no page errors (${pageErrors.join("; ") || "none"})`);
  const html = await page.content();
  check(!html.includes(sdkKey), "the rendered page text does not show the key");

  // 4. Flip show_banner off; a reload revalidates through the HTTP cache and shows it.
  const current = await flags.settings.values.retrieve(show.id, env.id);
  await flags.settings.values.update(show.id, env.id, { value: false, version: current.version, note: "sdk 019 example toggle" });
  let after = first;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(4_000);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("[data-testid=ready]")?.textContent === "true", null, { timeout: 15_000 });
    after = await read();
    if (after.show === "false") break;
  }
  check(after.show === "false", `after the toggle the page reads show_banner = ${after.show} (${after.text})`);
} catch (e) {
  failures += 1;
  console.log(`FAIL ${e?.constructor?.name ?? "Error"}: ${String(e?.message ?? e).split("\n")[0]} ${e?.code ? `(${e.code})` : ""}`);
} finally {
  await browser?.close().catch(() => undefined);
  server?.kill();
  rmSync(join(APP, "dist"), { recursive: true, force: true });
  if (LOCAL) rmSync(APP, { recursive: true, force: true });
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

#!/usr/bin/env node
// Size budget (docs/sdk-standard.md section 4): bundle a one-call consumer
// per package with esbuild (minified, browser platform, ESM), gzip it,
// and compare with scripts/size-budget.json. The limit is the first
// measurement plus 10%. `--record` writes the current sizes as the new
// baseline (only when a deliberate change grows the runtime).
//
// Usage: node scripts/size-budget.mjs [--record]   (after `pnpm run build`)

import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgetPath = join(root, "scripts", "size-budget.json");

// One consumer per package (or per entry point, with `pkg`): the smallest realistic program that uses it.
const consumers = {
  "@productcraft/core": {
    dir: "packages/core",
    code: `import { APIClient } from "@productcraft/core";
const pc = new APIClient({ apiKey: "pcft_live_x", workspaceId: "ws" }, "https://api.mail.productcraft.co");
export const run = () => pc.request({ method: "POST", path: "/v1/workspaces/{workspace_id}/templates/{name}/send", pathParams: { name: "welcome" }, body: { to: "a@b.c" }, idempotent: true });`,
  },
  "@productcraft/mail": {
    dir: "packages/mail",
    code: `import { Mail } from "@productcraft/mail";
const mail = new Mail({ apiKey: "pcft_live_x", workspaceId: "ws" });
export const run = () => mail.emails.send({ from: "a@b.c", to: "d@e.f", subject: "s", html: "<p>x</p>" });`,
  },
  "@productcraft/waitlist": {
    dir: "packages/waitlist",
    code: `import { Waitlist } from "@productcraft/waitlist";
const form = new Waitlist().public({ workspace: "acme", waitlist: "beta" });
export const run = () => form.entries.create({ email: "a@b.c", name: "Ada" });`,
  },
  "@productcraft/platform-auth": {
    dir: "packages/platform-auth",
    code: `import { PlatformAuth } from "@productcraft/platform-auth";
const platform = new PlatformAuth({ apiKey: "pcft_live_x" });
export const run = () => platform.apiKeys.self();`,
  },
  "@productcraft/social": {
    dir: "packages/social",
    code: `import { Social } from "@productcraft/social";
const social = new Social({ apiKey: "pcft_live_x" });
export const run = () => social.community("c").as("a").posts.create({ body: "Hello" });`,
  },
  "@productcraft/auth": {
    dir: "packages/auth",
    code: `import { Auth } from "@productcraft/auth";
const auth = new Auth();
export const run = () => auth.consumer("my-app").signin({ identifier: "ada@example.com", password: "pw" });`,
  },
  // The engine alone (parse + evaluate), as an edge function that fetches its own config would use it.
  // Its limit is fixed at 6 KB gzip by task 014 rather than measured + 10%.
  "@productcraft/flags-engine": {
    dir: "packages/flags-engine",
    code: `import { parseConfig, evaluate } from "@productcraft/flags-engine";
export const run = (body, user) => evaluate(parseConfig(body), "new_checkout", false, user).value;`,
  },
  // FlagsClient's one-call program (task 015): the download loop, cache, overrides and the engine.
  // Fixed limit of 11 KB gzip: the design's 10 KB target is missed by about 0.5 KB (decision log,
  // 2026-11-10). The Node-only override-file module imports node:fs lazily and stays external, as a
  // browser bundler leaves it.
  "@productcraft/flags": {
    dir: "packages/flags",
    code: `import { FlagsClient } from "@productcraft/flags";
const flags = new FlagsClient({ sdkKey: "pcf_sdk_x" });
export const run = () => flags.getValue("k", false);`,
  },
  // The browser / React Native build of the same program (task 019): dist/browser, as a bundler that
  // honours the package's `browser` export condition resolves it. Fixed limit of 11 KB gzip: the design's
  // 10 KB target is missed by about 0.35 KB (decision log, 2026-11-10, task 019).
  "@productcraft/flags (browser)": {
    dir: "packages/flags",
    entry: "dist/browser/index.js",
    code: `import { FlagsClient } from "@productcraft/flags";
const flags = new FlagsClient({ sdkKey: "pcf_sdk_x" });
export const run = () => flags.getValue("k", false);`,
  },
  // The React bindings on top of the browser FlagsClient (task 019): react and @productcraft/flags are
  // the app's own (peers), so they stay external and this measures the provider and hooks. Fixed 2 KB.
  "@productcraft/flags-react": {
    dir: "packages/flags-react",
    external: ["react", "@productcraft/flags"],
    code: `import { createElement } from "react";
import { FlagsProvider, useFlag, useFlagDetails, useFlagsClient, useFlagsReady } from "@productcraft/flags-react";
const App = () => createElement("p", null, String(useFlag("k", false)), useFlagDetails("b", "x").reason, String(useFlagsReady()), String(!!useFlagsClient()));
export const run = () => createElement(FlagsProvider, { options: { sdkKey: "pcf_sdk_x" } }, createElement(App));`,
  },
  // The OpenFeature provider over FlagsClient (task 016). @openfeature/server-sdk is the app's own
  // dependency (a peer), so it stays external: this measures the provider plus FlagsClient.
  "@productcraft/flags-openfeature": {
    dir: "packages/flags-openfeature",
    external: ["@openfeature/server-sdk"],
    code: `import { ProductCraftFlagsProvider } from "@productcraft/flags-openfeature";
const provider = new ProductCraftFlagsProvider({ sdkKey: "pcf_sdk_x" });
export const run = () => provider.resolveBooleanEvaluation("k", false, { targetingKey: "u" });`,
  },
  // Notify: a server send, and the browser-side recipient-token scope (task 017). Both bundle the
  // generated client; the second entry measures what a browser app ships for the inbox.
  "@productcraft/notify": {
    dir: "packages/notify",
    code: `import { Notify } from "@productcraft/notify";
const notify = new Notify({ apiKey: "pcft_live_x", workspaceId: "ws" });
export const run = () => notify.notifications.send({ type: "comment_created", recipients: ["user_123"] });`,
  },
  "@productcraft/notify (client scope)": {
    pkg: "@productcraft/notify",
    dir: "packages/notify",
    code: `import { Notify } from "@productcraft/notify";
export const run = (token) => new Notify().client({ token }).inbox.list();`,
  },
  // The Notify browser core (task 018): the inbox store, stream reader and web push helper. Its own code only:
  // @productcraft/notify (the generated client scope, measured above) stays external. Fixed limit of 6 KB gzip.
  "@productcraft/notify-js": {
    dir: "packages/notify-js",
    external: ["@productcraft/notify"],
    code: `import { createNotifyClient, registerWebPush } from "@productcraft/notify-js";
const notify = createNotifyClient({ getToken: () => fetch("/api/notify-token").then((r) => r.text()) });
export const run = () => { notify.inbox.subscribe(() => {}); return registerWebPush(notify, { serviceWorkerPath: "/notify-sw.js" }); };`,
  },
  "@productcraft/trawl": {
    dir: "packages/trawl",
    code: `import { Trawl } from "@productcraft/trawl";
const trawl = new Trawl({ apiKey: "pcft_live_x", workspaceId: "ws" });
export const run = () => trawl.jobs.createAndPoll({ description: "Title", json_schema: { type: "object" } });`,
  },
};

const record = process.argv.includes("--record");
const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
let failed = false;

for (const [label, { dir, code, external = [], entry: file, pkg = label.replace(/ \(.*\)$/, "") }] of Object.entries(consumers)) {
  const result = await build({
    stdin: { contents: code, resolveDir: join(root, dir), loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
    external: ["node:*", ...external],
    // Resolve the package to its own built dist, as a consumer would.
    alias: { [pkg]: join(root, dir, file ?? "") },
  });
  const bytes = result.outputFiles[0].contents;
  const gz = gzipSync(bytes, { level: 9 }).length;
  const entry = budget[label];
  if (record || !entry) {
    budget[label] = { measuredGzipBytes: gz, limitGzipBytes: Math.ceil(gz * 1.1) };
    console.log(`${label}: ${gz} B gzip (${bytes.length} B min) recorded, limit ${budget[label].limitGzipBytes} B`);
    continue;
  }
  const status = gz <= entry.limitGzipBytes ? "ok  " : "FAIL";
  if (gz > entry.limitGzipBytes) failed = true;
  console.log(`${status} ${label}: ${gz} B gzip (${bytes.length} B min); baseline ${entry.measuredGzipBytes} B, limit ${entry.limitGzipBytes} B`);
}

if (record) writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + "\n");
if (failed) {
  console.error("Size budget exceeded. If the growth is deliberate, run `node scripts/size-budget.mjs --record` and explain it in the PR.");
  process.exit(1);
}

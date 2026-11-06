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

// One consumer per package: the smallest realistic program that uses it.
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

for (const [name, { dir, code }] of Object.entries(consumers)) {
  const result = await build({
    stdin: { contents: code, resolveDir: join(root, dir), loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
    // Resolve the package to its own built dist, as a consumer would.
    alias: { [name]: join(root, dir) },
  });
  const bytes = result.outputFiles[0].contents;
  const gz = gzipSync(bytes, { level: 9 }).length;
  const entry = budget[name];
  if (record || !entry) {
    budget[name] = { measuredGzipBytes: gz, limitGzipBytes: Math.ceil(gz * 1.1) };
    console.log(`${name}: ${gz} B gzip (${bytes.length} B min) recorded, limit ${budget[name].limitGzipBytes} B`);
    continue;
  }
  const status = gz <= entry.limitGzipBytes ? "ok  " : "FAIL";
  if (gz > entry.limitGzipBytes) failed = true;
  console.log(`${status} ${name}: ${gz} B gzip (${bytes.length} B min); baseline ${entry.measuredGzipBytes} B, limit ${entry.limitGzipBytes} B`);
}

if (record) writeFileSync(budgetPath, JSON.stringify(budget, null, 2) + "\n");
if (failed) {
  console.error("Size budget exceeded. If the growth is deliberate, run `node scripts/size-budget.mjs --record` and explain it in the PR.");
  process.exit(1);
}

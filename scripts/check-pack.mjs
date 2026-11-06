#!/usr/bin/env node
// Every published package built by the generator ships its docs artefacts:
// `npm pack --dry-run` must list manifest.json (productcraft.co reads it for
// the Node tab), api.md, README.md and the /testing build (sdk-standard 8).
//
// Usage: node scripts/check-pack.mjs   (after `pnpm run build`)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SURFACES, ROOT } from "./gen-sdk.mjs";

const REQUIRED = ["manifest.json", "api.md", "README.md", "package.json", "dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/testing.js", "dist/testing.cjs", "dist/testing.d.ts"];
let failed = false;
for (const [surface, cfg] of Object.entries(SURFACES)) {
  const dir = join(ROOT, cfg.packageDir);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  if (pkg.private) continue;
  const [report] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: dir, encoding: "utf8" }));
  const files = new Set(report.files.map((f) => f.path));
  const missing = REQUIRED.filter((f) => !files.has(f));
  const manifest = files.has("manifest.json") ? JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) : {};
  if (missing.length || manifest.package !== pkg.name) {
    failed = true;
    console.error(`✗ ${pkg.name}: missing ${missing.join(", ") || "nothing"}${manifest.package !== pkg.name ? `; manifest.json names ${manifest.package}` : ""}`);
  } else console.log(`✓ ${pkg.name} (${surface}): ${report.files.length} files, ${REQUIRED.length} required present`);
}
if (failed) process.exit(1);

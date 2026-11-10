#!/usr/bin/env node
// Type resolution of every PUBLISHED package, as a consumer's TypeScript sees it.
// check-dts and smoke-dist only look at the ESM .d.ts and the runtime, so they
// cannot see two real failures we shipped through 1.0:
//   - a CommonJS consumer on moduleResolution node16/nodenext got the ESM
//     .d.ts through a flat `types` condition (TS1479, "masquerading as ESM");
//   - `@productcraft/<p>/testing` did not resolve on moduleResolution node10
//     (conquer-api), which ignores `exports`.
// Two layers:
//   1. attw (@arethetypeswrong/cli) on each packed tarball: node10, node16 CJS,
//      node16 ESM and bundler, every subpath.
//   2. A real consumer: the tarballs installed together into a scratch project,
//      typechecked with tsc as a node16 .cts file, a nodenext ESM file and a
//      node10 CommonJS file (the root entry and /testing of every product).
//
// Usage: node scripts/check-types-resolution.mjs   (after `pnpm run build`)

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./gen-sdk.mjs";

const OUT = join(ROOT, "node_modules/.cache/check-types-resolution");
const TARBALLS = join(OUT, "tarballs");
const CONSUMER = join(OUT, "consumer");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(TARBALLS, { recursive: true });
mkdirSync(CONSUMER, { recursive: true });

const pkgs = [];
for (const d of readdirSync(join(ROOT, "packages"))) {
  const dir = join(ROOT, "packages", d);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (pkg.private) continue;
  // pnpm pack rewrites workspace:^ ranges, as the release does.
  const before = new Set(readdirSync(TARBALLS));
  execFileSync("pnpm", ["pack", "--pack-destination", TARBALLS], { cwd: dir, stdio: "ignore" });
  const tgz = readdirSync(TARBALLS).find((f) => !before.has(f));
  // Plain-file exports (a service worker to copy, not a module to import) have no types by design.
  const assets = Object.entries(pkg.exports ?? {}).filter(([k, v]) => typeof v === "string" && !k.endsWith(".json")).map(([k]) => k);
  pkgs.push({ name: pkg.name, tgz: join(TARBALLS, tgz), testing: Boolean(pkg.exports?.["./testing"]), className: null, assets });
}

let failed = false;

// 1. attw
const attw = join(ROOT, "node_modules/.bin/attw");
for (const p of pkgs) {
  try {
    const exclude = p.assets.length ? ["--exclude-entrypoints", ...p.assets] : [];
    execFileSync(attw, [p.tgz, "--format", "table-flipped", ...exclude], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log(`✓ attw ${p.name}: node10, node16 (CJS + ESM) and bundler resolve every subpath`);
  } catch (e) {
    failed = true;
    console.error(`✗ attw ${p.name}\n${e.stdout ?? ""}${e.stderr ?? ""}`);
  }
}

// 2. a real consumer
writeFileSync(join(CONSUMER, "package.json"), JSON.stringify({ name: "consumer", private: true, version: "0.0.0" }, null, 2));
// A React consumer also has @types/react (flags-react's declarations import React's types).
const reactTypes = JSON.parse(readFileSync(join(ROOT, "packages/flags-react/package.json"), "utf8")).devDependencies["@types/react"];
execFileSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--loglevel=error", ...pkgs.map((p) => p.tgz), `@types/react@${reactTypes}`], { cwd: CONSUMER, stdio: "inherit" });

const imports = pkgs.flatMap((p, i) => [`import * as m${i} from "${p.name}";`, ...(p.testing ? [`import * as t${i} from "${p.name}/testing";`] : [])]);
const uses = pkgs.flatMap((p, i) => [`void m${i};`, ...(p.testing ? [`void t${i};`] : [])]);
const body = [...imports, ...uses, "export {};", ""].join("\n");
writeFileSync(join(CONSUMER, "cjs-node16.cts"), body);
writeFileSync(join(CONSUMER, "esm-nodenext.mts"), body);
writeFileSync(join(CONSUMER, "cjs-node10.ts"), body);

const tsc = join(ROOT, "node_modules/typescript/bin/tsc");
const common = ["--noEmit", "--strict", "--skipLibCheck", "false", "--target", "es2022", "--types", "node", "--typeRoots", join(ROOT, "node_modules/@types"), "--lib", "es2022,dom,dom.iterable,dom.asynciterable"];
const runs = [
  { label: "node16, .cts (CommonJS)", args: ["--module", "node16", "--moduleResolution", "node16", "cjs-node16.cts"] },
  { label: "nodenext, .mts (ESM)", args: ["--module", "nodenext", "--moduleResolution", "nodenext", "esm-nodenext.mts"] },
  { label: "node10, module commonjs (conquer-api)", args: ["--module", "commonjs", "--moduleResolution", "node10", "--esModuleInterop", "cjs-node10.ts"] },
];
for (const r of runs) {
  try {
    execFileSync("node", [tsc, ...common, ...r.args], { cwd: CONSUMER, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    console.log(`✓ consumer tsc ${r.label}: ${imports.length} imports typecheck (skipLibCheck off)`);
  } catch (e) {
    failed = true;
    console.error(`✗ consumer tsc ${r.label}\n${e.stdout ?? ""}${e.stderr ?? ""}`);
  }
}

if (failed) process.exit(1);

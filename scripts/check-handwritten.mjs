#!/usr/bin/env node
// Fails when a file under packages/*/src is neither generated nor on
// scripts/handwritten-allowlist.json, when a generated file is committed,
// or when a package's src/index.ts is over the line limit (sdk-standard section 6).
//
// Usage: node scripts/check-handwritten.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const list = JSON.parse(readFileSync(join(ROOT, "scripts/handwritten-allowlist.json"), "utf8"));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
// Tracked files plus new untracked ones that are not ignored (so a local run catches them before commit).
const files = [...new Set([...git("ls-files", "packages"), ...git("ls-files", "--others", "--exclude-standard", "packages")])]
  .filter((f) => /^packages\/[^/]+\/src\//.test(f))
  .sort();

const toRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);
const rules = list.allow.map((r) => ({ ...r, re: toRegex(r.glob) }));
const problems = [];
for (const f of files) {
  if (/\/_generated(\/|\.d\.ts$)/.test(f)) {
    problems.push(`${f}: generated output is committed (it is rewritten by pnpm run codegen; remove it from git)`);
    continue;
  }
  if (!rules.some((r) => r.re.test(f))) problems.push(`${f}: hand-written file not on scripts/handwritten-allowlist.json (generate it, or add it there with a reason)`);
  if (/^packages\/[^/]+\/src\/index\.ts$/.test(f) && !list.indexLineExceptions[f]) {
    const n = readFileSync(join(ROOT, f), "utf8").trimEnd().split("\n").length;
    if (n > list.maxIndexLines) problems.push(`${f}: ${n} lines, over the ${list.maxIndexLines}-line limit for a package shell`);
  }
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${files.length} hand-written files under packages/*/src, all on the allowlist`);

#!/usr/bin/env node
// Typechecks every TypeScript code block in the READMEs, api.md files, docs/
// and examples/ against the BUILT packages (run after `pnpm run build`).
//
// Skipped: fences tagged ```ts before (old-version shapes in migration guides
// and known-stale examples awaiting their product task) and docs/sdk-standard.md
// (illustrative). `express` and `hono` resolve to `any` shims so framework
// recipes check without installing frameworks.
//
// Usage: node scripts/check-snippets.mjs [--verbose]

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "node_modules/.cache/check-snippets");
const SKIP = new Set(["docs/sdk-standard.md"]);

const walk = (dir, pred, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
};

const sources = [
  join(ROOT, "README.md"),
  ...readdirSync(join(ROOT, "packages")).sort().flatMap((d) => ["README.md", "api.md"].map((f) => join(ROOT, "packages", d, f))),
  ...walk(join(ROOT, "docs"), (p) => p.endsWith(".md")),
  ...walk(join(ROOT, "examples"), (p) => p.endsWith(".ts")),
].filter((p) => existsSync(p) && !SKIP.has(relative(ROOT, p)));

// One module per snippet: { file, origin (path), line (1-based start of the code) }.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const snippets = [];
for (const src of sources) {
  const rel = relative(ROOT, src);
  const text = readFileSync(src, "utf8");
  if (src.endsWith(".ts")) {
    snippets.push({ code: text, origin: rel, line: 1 });
    continue;
  }
  // A file may declare a preamble (imports, the client) that every block assumes.
  const preamble = /<!-- snippet-preamble: (.*?) -->/.exec(text)?.[1] ?? "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*```(ts|typescript)(\s+.*)?$/.exec(lines[i]);
    if (!open) continue;
    const info = (open[2] ?? "").trim();
    let j = i + 1;
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) j++;
    if (info !== "before") snippets.push({ code: lines.slice(i + 1, j).join("\n"), preamble, origin: rel, line: i + 2 });
    i = j;
  }
}
const files = snippets.map((s, n) => {
  const file = join(OUT, `snippet-${String(n).padStart(4, "0")}.ts`);
  // Module scope (top-level await, no globals leaking between snippets).
  // The preamble shares the code's first line, so reported line numbers stay right.
  const code = s.preamble ? `${s.preamble} ${s.code}` : s.code;
  writeFileSync(file, /^\s*(import|export)\s/m.test(code) ? code + "\n" : code + "\nexport {};\n");
  return { ...s, file };
});
writeFileSync(join(OUT, "shims.d.ts"), 'declare module "express";\ndeclare module "hono";\n');

// Resolve every workspace package to its built declarations.
const paths = {};
for (const dir of readdirSync(join(ROOT, "packages")).sort()) {
  const pj = join(ROOT, "packages", dir, "package.json");
  if (!existsSync(pj)) continue;
  const pkg = JSON.parse(readFileSync(pj, "utf8"));
  for (const [sub, target] of Object.entries(pkg.exports ?? {})) {
    // The ESM declarations: `import.types` (nested conditions), or a flat `types`.
    const types = typeof target === "object" ? (target.import?.types ?? target.types) : undefined;
    if (!types) continue;
    const abs = join(ROOT, "packages", dir, types);
    if (!existsSync(abs)) {
      console.error(`✗ ${pkg.name}${sub.slice(1)}: ${relative(ROOT, abs)} missing; run pnpm run build first`);
      process.exit(1);
    }
    paths[pkg.name + sub.slice(1)] = [abs];
  }
}

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts", "lib.dom.asynciterable.d.ts"],
  types: ["node"],
  typeRoots: [join(ROOT, "node_modules/@types")],
  strict: true,
  // Framework recipes take untyped (req, res) from the any-shims above.
  noImplicitAny: false,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  baseUrl: ROOT,
  paths,
};
const program = ts.createProgram([...files.map((f) => f.file), join(OUT, "shims.d.ts")], options);
const byFile = new Map(files.map((f) => [f.file, f]));
let errors = 0;
const failedSnippets = new Set();
for (const d of ts.getPreEmitDiagnostics(program)) {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  const snip = d.file && byFile.get(d.file.fileName);
  if (!snip) {
    console.error(`✗ ${msg}`);
    errors++;
    continue;
  }
  const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
  console.error(`✗ ${snip.origin}:${snip.line + line}: ${msg}`);
  failedSnippets.add(snip.file);
  errors++;
}
const verbose = process.argv.includes("--verbose");
if (verbose) for (const f of files) console.log(`${failedSnippets.has(f.file) ? "FAIL" : "ok  "} ${f.origin}:${f.line}`);
if (errors) {
  console.error(`\n${failedSnippets.size} of ${files.length} snippets fail to typecheck. Fix them, or fence old shapes as \`\`\`ts before.`);
  process.exit(1);
}
console.log(`✓ ${files.length} snippets from ${sources.length} files typecheck against the built packages`);

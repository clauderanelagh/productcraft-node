#!/usr/bin/env node
// The BUILT .d.ts of every generated package typechecks with skipLibCheck OFF,
// and its public type namespace is real types, not `any`. The .d.ts bundler
// flattens `T.Job` to `Job`, so a namespace member written as
// `export type Job = T.Job` became `type Job = Job` (TS2456), which consumers
// with skipLibCheck on silently see as `any` (@productcraft/trawl 1.0.0).
//
// Usage: node scripts/check-dts.mjs   (after `pnpm run build`)

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { ROOT, SURFACES } from "./gen-sdk.mjs";

const OUT = join(ROOT, "node_modules/.cache/check-dts");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const paths = {};
const files = [];
for (const [surface, cfg] of Object.entries(SURFACES)) {
  const dir = join(ROOT, cfg.packageDir);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  paths[pkg.name] = [join(dir, "dist/index.d.ts")];
  paths[`${pkg.name}/testing`] = [join(dir, "dist/testing.d.ts")];
  const manifest = JSON.parse(readFileSync(join(dir, "src/_generated/manifest.json"), "utf8"));
  // Every params/model type name the manifest mentions must not be `any`.
  const names = [...new Set(Object.values(manifest.operations).flatMap((o) => [o.params, ...(o.signature.match(new RegExp(`${cfg.className}\\.\\w+`, "g")) ?? [])]).filter(Boolean))].sort();
  const C = cfg.className;
  const code = [
    `import { ${C} } from "${pkg.name}";`,
    `import { createMockFetch } from "${pkg.name}/testing";`,
    // A real type rejects an unrelated value; an `any`-like one (the circular alias) does not,
    // so the directive goes unused and fails. (An IsAny<T> test misses the error type.)
    "declare const brand: { readonly __pcBrand: unique symbol };",
    ...[...names, `${C}.RequestOptions`].flatMap((n, i) => ["// @ts-expect-error", `export const t${i}: ${n} = brand;`]),
    `void createMockFetch;`,
  ].join("\n");
  const file = join(OUT, `${surface}.ts`);
  writeFileSync(file, code + "\n");
  files.push({ file, surface, count: names.length });
}

const program = ts.createProgram(files.map((f) => f.file), {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts", "lib.dom.asynciterable.d.ts"],
  types: ["node"],
  typeRoots: [join(ROOT, "node_modules/@types")],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  baseUrl: ROOT,
  paths,
});
let errors = 0;
for (const d of ts.getPreEmitDiagnostics(program)) {
  const where = d.file ? `${d.file.fileName.replace(ROOT + "/", "")}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : "";
  // Only our own declarations: third-party .d.ts noise is not this check's business.
  if (d.file && d.file.fileName.includes("node_modules/") && !d.file.fileName.includes(".cache/check-dts")) continue;
  console.error(`✗ ${where} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
  errors++;
}
if (errors) process.exit(1);
for (const f of files) console.log(`✓ ${f.surface}: dist .d.ts clean with skipLibCheck off; ${f.count} public types are real types, not any`);

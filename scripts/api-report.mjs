#!/usr/bin/env node
// Public API report per package (api-extractor over the built dist/index.d.ts),
// committed as packages/<p>/api-report.md and diffed in CI (sdk-standard section 10).
// A renamed or removed public type shows up here as a diff.
//
// Usage (after `pnpm run build`):
//   node scripts/api-report.mjs            fail if any report differs from the committed one
//   node scripts/api-report.mjs --update   rewrite the committed reports
//   node scripts/api-report.mjs <dir>…     only these packages (directory names under packages/)

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const update = args.includes("--update");
const only = args.filter((a) => !a.startsWith("--"));
const tmpBase = process.env.TMPDIR ?? join(ROOT, "node_modules/.cache");
// A fresh checkout (spec-refresh.yml) has no node_modules/.cache yet.
mkdirSync(tmpBase, { recursive: true });

let failed = false;
for (const dir of readdirSync(join(ROOT, "packages")).sort()) {
  if (only.length && !only.includes(dir)) continue;
  const pkgDir = join(ROOT, "packages", dir);
  const pkgJson = join(pkgDir, "package.json");
  if (!existsSync(pkgJson)) continue;
  const entry = join(pkgDir, "dist/index.d.ts");
  if (!existsSync(entry)) {
    console.error(`✗ ${dir}: dist/index.d.ts missing; run pnpm run build first`);
    failed = true;
    continue;
  }
  const work = mkdtempSync(join(tmpBase, `api-report-${dir}-`));
  try {
    const config = ExtractorConfig.prepare({
      configObjectFullPath: join(pkgDir, "api-extractor.json"),
      packageJsonFullPath: pkgJson,
      configObject: {
        projectFolder: pkgDir,
        mainEntryPointFilePath: entry,
        compiler: {
          overrideTsconfig: {
            compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", lib: ["es2022", "dom"], types: ["node"], typeRoots: [join(ROOT, "node_modules/@types")], skipLibCheck: true, strict: true },
            files: [entry],
          },
        },
        apiReport: { enabled: true, reportFolder: work, reportTempFolder: join(work, "temp"), reportFileName: "<unscopedPackageName>" },
        docModel: { enabled: false },
        dtsRollup: { enabled: false },
        tsdocMetadata: { enabled: false },
        messages: {
          compilerMessageReporting: { default: { logLevel: "warning" } },
          extractorMessageReporting: { default: { logLevel: "none" } },
          tsdocMessageReporting: { default: { logLevel: "none" } },
        },
      },
    });
    const result = Extractor.invoke(config, { localBuild: true, showVerboseMessages: false, messageCallback: (m) => { if (String(m.messageId).startsWith("console-")) { m.handled = true; return; } if (m.logLevel === "warning" || m.logLevel === "error") { console.error(`  ${dir}: ${m.text}`); m.handled = true; } } });
    if (!result.succeeded && result.errorCount > 0) {
      console.error(`✗ ${dir}: api-extractor failed (${result.errorCount} errors)`);
      failed = true;
      continue;
    }
    const produced = readdirSync(work).find((f) => f.endsWith(".api.md"));
    const report = readFileSync(join(work, produced), "utf8").replace(/\r\n/g, "\n");
    const target = join(pkgDir, "api-report.md");
    const current = existsSync(target) ? readFileSync(target, "utf8") : undefined;
    if (current === report) console.log(`✓ ${dir}: API report unchanged`);
    else if (update) {
      writeFileSync(target, report);
      console.log(`› ${dir}: API report ${current === undefined ? "written" : "updated"}`);
    } else {
      console.error(`✗ ${dir}: public API differs from packages/${dir}/api-report.md (review, then pnpm run api-report and commit)`);
      failed = true;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
if (failed) process.exit(1);

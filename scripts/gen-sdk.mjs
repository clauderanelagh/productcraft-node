#!/usr/bin/env node
// The SDK generator (docs/sdk-standard.md section 5).
//
// Turns an OpenAPI document into a package's generated surface:
//   packages/<p>/src/_generated/   paths.d.ts, types.ts, resources.ts, client.ts,
//                                  errors.ts, webhooks.ts, testing.ts, manifest.json  (gitignored)
//   packages/<p>/tests/_generated/operations.test.ts                                  (gitignored)
//   packages/<p>/api.md, the README region between the generated markers,
//   examples/<p>/*.ts                                                                 (checked in)
//
// It runs only for the packages in SURFACES. The rest keep the old
// openapi-typescript path in scripts/codegen.sh until their task switches them.
//
// Usage:
//   node scripts/gen-sdk.mjs                 generate every switched surface
//   node scripts/gen-sdk.mjs <surface>…      generate some
//   node scripts/gen-sdk.mjs --check         generate twice in memory; fail if the runs differ
//                                            or the checked-in docs differ from fresh output
//   node scripts/gen-sdk.mjs --list          print the switched surfaces

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitApiMd, emitExamples, emitManifest, emitReadmeRegion, spliceReadme } from "./gen-sdk/emit-docs.mjs";
import { emitClient, emitErrors, emitOpsTest, emitPaths, emitResources, emitTesting, emitTypes, emitWebhooks } from "./gen-sdk/emit-code.mjs";
import { buildModel, GenError } from "./gen-sdk/model.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Packages switched to the generator. Product identity lives here (class name,
 * base URL, scope accessors), so nothing per endpoint is hand-written.
 * scopes: { accessor: { bind: [path params], args: "positional" | { field: param }, actor?: true, doc } }
 */
export const SURFACES = {
  trawl: {
    spec: "Specs/trawl.json",
    packageDir: "packages/trawl",
    packageName: "@productcraft/trawl",
    sdkName: "trawl",
    className: "Trawl",
    clientVar: "trawl",
    title: "ProductCraft Trawl API client (AI web extraction)",
    baseUrlKey: "trawl",
    docsUrl: "https://productcraft.co/docs/trawl",
    webhookSecretEnv: "PRODUCTCRAFT_TRAWL_WEBHOOK_SECRET",
    scopes: {},
  },
  "gen-fixture": {
    spec: "packages/gen-fixture/fixture.openapi.json",
    packageDir: "packages/gen-fixture",
    packageName: "@productcraft/gen-fixture",
    sdkName: "gen-fixture",
    className: "Fixture",
    clientVar: "fixture",
    title: "Fixture API client (generator test fixture, never published)",
    baseUrl: "https://api.fixture.example.com",
    docsUrl: "https://productcraft.co/docs/fixture",
    webhookSecretEnv: "PRODUCTCRAFT_FIXTURE_WEBHOOK_SECRET",
    scopes: {
      community: { bind: ["community_id"], args: "positional", actor: true, doc: "Calls scoped to one community. Chain `.as(actorId)` to act as a user." },
      public: { bind: ["workspace_slug", "waitlist_slug"], args: { workspace: "workspace_slug", waitlist: "waitlist_slug" }, doc: "Keyless, browser-safe calls for one public waitlist." },
    },
  },
};

/** Generate one surface in memory: { relative path → contents }. */
export async function generate(surface, spec = undefined) {
  const cfg = { surface, ...SURFACES[surface] };
  if (!SURFACES[surface]) throw new Error(`gen-sdk: unknown surface "${surface}" (switched: ${Object.keys(SURFACES).join(", ")})`);
  const doc = spec ?? JSON.parse(readFileSync(join(ROOT, cfg.spec), "utf8"));
  const model = buildModel(doc, cfg);
  const g = `${cfg.packageDir}/src/_generated`;
  const files = {
    [`${g}/paths.d.ts`]: await emitPaths(doc, cfg),
    [`${g}/types.ts`]: emitTypes(model, cfg),
    [`${g}/resources.ts`]: emitResources(model, cfg),
    [`${g}/client.ts`]: emitClient(model, cfg),
    [`${g}/errors.ts`]: emitErrors(model, cfg),
    [`${g}/webhooks.ts`]: emitWebhooks(model, cfg),
    [`${g}/testing.ts`]: emitTesting(model, cfg),
    [`${g}/manifest.json`]: emitManifest(model, cfg),
    [`${cfg.packageDir}/tests/_generated/operations.test.ts`]: emitOpsTest(model, cfg),
    [`${cfg.packageDir}/api.md`]: emitApiMd(model, cfg),
    ...emitExamples(model, cfg),
  };
  const readmePath = `${cfg.packageDir}/README.md`;
  const current = existsSync(join(ROOT, readmePath)) ? readFileSync(join(ROOT, readmePath), "utf8") : `# ${cfg.packageName}\n`;
  files[readmePath] = spliceReadme(current, emitReadmeRegion(model, cfg));
  return { files, model, cfg };
}

/** Checked-in outputs (everything outside the gitignored _generated dirs). */
export const isCommitted = (path) => !path.includes("/_generated/");

async function main(argv) {
  const check = argv.includes("--check");
  if (argv.includes("--list")) return console.log(Object.keys(SURFACES).join("\n"));
  const names = argv.filter((a) => !a.startsWith("--"));
  const surfaces = names.length ? names : Object.keys(SURFACES);
  let failed = false;
  for (const surface of surfaces) {
    const a = await generate(surface);
    if (check) {
      const b = await generate(surface);
      for (const p of Object.keys(a.files)) {
        if (a.files[p] !== b.files[p]) {
          console.error(`✗ ${p}: two runs differ (non-deterministic output)`);
          failed = true;
        }
        if (isCommitted(p)) {
          const disk = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : undefined;
          if (disk !== a.files[p]) {
            console.error(`✗ ${p}: checked-in file differs from fresh output (run pnpm run codegen and commit)`);
            failed = true;
          }
        }
      }
      if (!failed) console.log(`✓ ${surface}: deterministic, checked-in docs up to date`);
      continue;
    }
    rmSync(join(ROOT, a.cfg.packageDir, "src/_generated"), { recursive: true, force: true });
    rmSync(join(ROOT, a.cfg.packageDir, "tests/_generated"), { recursive: true, force: true });
    rmSync(join(ROOT, "examples", surface), { recursive: true, force: true });
    for (const [p, content] of Object.entries(a.files)) {
      mkdirSync(dirname(join(ROOT, p)), { recursive: true });
      writeFileSync(join(ROOT, p), content);
    }
    console.log(`› ${surface} → ${a.cfg.packageDir} (${a.model.ops.length} operations, via gen-sdk)`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof GenError ? err.message : err?.stack ?? err);
    process.exit(1);
  });
}

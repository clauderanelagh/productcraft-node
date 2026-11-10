// The browser build bundles for a page with no `node:` import and no process.env read (task 019).
// A separate file because esbuild refuses to run under jsdom. Needs `pnpm run build` first.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

it("bundles for the browser with no `node:` import and no process.env read", async () => {
  // A consumer project whose node_modules holds this package, so `exports` and its conditions apply.
  const app = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "flags-browser-"));
  mkdirSync(join(app, "node_modules/@productcraft"), { recursive: true });
  symlinkSync(PKG, join(app, "node_modules/@productcraft/flags"), "dir");
  const out = await build({
    stdin: { contents: `import { FlagsClient } from "@productcraft/flags"; import { createTestClient } from "@productcraft/flags/testing"; export { FlagsClient, createTestClient };`, resolveDir: app, loader: "js" },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  }).catch((e: Error) => e);
  rmSync(app, { recursive: true, force: true });
  expect(out).not.toBeInstanceOf(Error);
  const text = (out as { outputFiles: { text: string }[] }).outputFiles[0]!.text;
  expect(text).not.toMatch(/["']node:/);
  expect(text).not.toMatch(/process\.env/);
  expect(text).toMatch(/visibilitychange/);
  expect(text).toMatch(/dist\/browser\/chunk-/);
});

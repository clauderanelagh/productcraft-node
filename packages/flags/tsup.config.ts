import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  // The generated management client is its own (internal) entry, so the ESM chunks keep it apart
  // from FlagsClient: an app that only evaluates flags does not bundle the management client.
  entry: { index: "src/index.ts", testing: "src/testing.ts", management: "src/_generated/client.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  shims: true,
  target: "es2022",
  define: { __PC_SDK_VERSION__: JSON.stringify(version) },
  // Keep `node:` on the lazily imported override-file module, so bundlers see a Node builtin.
  removeNodeProtocol: false,
});

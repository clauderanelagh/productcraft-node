import { readFileSync } from "node:fs";
import { defineConfig, type Options } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const shared: Options = {
  entry: { index: "src/index.ts", testing: "src/testing.ts" },
  sourcemap: true,
  splitting: false,
  treeshake: true,
  shims: true,
  target: "es2022",
  define: { __PC_SDK_VERSION__: JSON.stringify(version) },
};

export default defineConfig([
  { ...shared, format: ["esm"], dts: true },
  // jose 6 is ESM-only: `require()` of it fails below Node 20.19 (no require(esm)),
  // and the package supports Node 20.3+. The CJS build carries its own copy.
  { ...shared, format: ["cjs"], noExternal: ["jose"] },
]);

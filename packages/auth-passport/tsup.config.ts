import { defineConfig, type Options } from "tsup";

const shared: Options = {
  entry: { index: "src/index.ts" },
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  shims: true,
};

export default defineConfig([
  { ...shared, format: ["esm"], dts: true },
  // jose 6 is ESM-only: `require()` of it fails below Node 20.19 (no require(esm)),
  // and the package supports Node 20.3+. The CJS build carries its own copy.
  { ...shared, format: ["cjs"], noExternal: ["jose"] },
]);

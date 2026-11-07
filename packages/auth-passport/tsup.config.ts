import { defineConfig, type Options } from "tsup";

const shared: Options = {
  entry: { index: "src/index.ts" },
  sourcemap: true,
  splitting: false,
  treeshake: true,
  // Keep class names: `err.constructor.name` is `APIError`, not esbuild's `_APIError`.
  keepNames: true,
  target: "es2022",
  shims: true,
};

export default defineConfig([
  { ...shared, format: ["esm"], dts: true },
  // jose 6 is ESM-only: `require()` of it fails below Node 20.19 (no require(esm)),
  // and the package supports Node 20.3+. The CJS build carries its own copy.
  // Its own .d.cts is what `require` consumers on node16/nodenext resolve (the ESM
  // .d.ts there is TS1479); the public types must never import jose's ESM-only
  // declarations (src/jwt/jose-types.ts in @productcraft/auth).
  { ...shared, format: ["cjs"], dts: true, noExternal: ["jose"] },
]);

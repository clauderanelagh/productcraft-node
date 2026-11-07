import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  // Keep class names: `err.constructor.name` is `APIError`, not esbuild's `_APIError`.
  keepNames: true,
  target: "es2022",
});

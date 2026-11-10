import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", sw: "src/sw.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
  // Browser code: no Node shims, and @productcraft/notify stays the app's dependency.
  shims: false,
  external: ["@productcraft/notify"],
});

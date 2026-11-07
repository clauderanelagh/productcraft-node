import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  entry: { index: "src/index.ts", testing: "src/testing.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  // Keep class names: `err.constructor.name` is `APIError`, not esbuild's `_APIError`.
  keepNames: true,
  shims: true,
  target: "es2022",
  define: { __PC_SDK_VERSION__: JSON.stringify(version) },
});

import { defineConfig } from "tsup";

// One bundle per public entrypoint, dual ESM + CJS, types per entry.
// Per-surface entries (`productcraft/heimdall`, …) let consumers tree-
// shake to a single product if they only use one.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    heimdall: "src/heimdall.ts",
    envoi: "src/envoi.ts",
    rally: "src/rally.ts",
    agora: "src/agora.ts",
    "platform-auth": "src/platform-auth.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
});

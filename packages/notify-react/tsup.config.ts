import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
  shims: false,
  external: ["react", "react/jsx-runtime", "react-dom", "@productcraft/notify-js", "@productcraft/notify"],
  esbuildOptions(o) {
    o.jsx = "automatic";
  },
  // Every export is a client component or hook: Next.js (App Router) must not run this module as a
  // server component. esbuild drops module directives, so the banner puts it back on both builds.
  banner: { js: '"use client";' },
});

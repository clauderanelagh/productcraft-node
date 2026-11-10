import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Options } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const common: Options = {
  // The generated management client is its own (internal) entry, so the ESM chunks keep it apart
  // from FlagsClient: an app that only evaluates flags does not bundle the management client.
  entry: { index: "src/index.ts", testing: "src/testing.ts", management: "src/_generated/client.ts" },
  format: ["esm", "cjs"],
  sourcemap: true,
  splitting: true,
  treeshake: true,
  target: "es2022",
  define: { __PC_SDK_VERSION__: JSON.stringify(version) },
  // `pnpm run build` empties dist/ first; the two builds below must not clean each other's output.
  clean: false,
};

/** The browser / React Native build: src/client/platform.ts becomes platform.browser.ts (no `node:`, no `process.env`). */
const browserPlatform = {
  name: "flags-browser-platform",
  setup(build: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string; resolveDir: string }) => { path: string } | undefined) => void }) {
    const target = fileURLToPath(new URL("./src/client/platform.browser.ts", import.meta.url));
    build.onResolve({ filter: /^\.\/platform\.js$/ }, (args) => (args.resolveDir.endsWith("client") ? { path: target } : undefined));
  },
};

export default defineConfig([
  {
    ...common,
    dts: true,
    shims: true,
    // Keep `node:` on the lazily imported override-file module, so bundlers see a Node builtin.
    removeNodeProtocol: false,
  },
  {
    // `exports` conditions `browser` and `react-native` (task 019). Same public API, so it reuses the
    // types of the main build.
    ...common,
    outDir: "dist/browser",
    dts: false,
    platform: "browser",
    esbuildPlugins: [browserPlatform],
  },
]);

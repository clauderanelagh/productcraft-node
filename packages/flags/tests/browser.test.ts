// @vitest-environment jsdom
// The browser / React Native build (dist/browser, `browser` and `react-native` export conditions; task 019):
// the engine vectors through it in bootstrap mode, no If-None-Match or User-Agent from a page, Node-only
// overrides reported, and auto polling paused while the page is hidden (the bundle check is in browser-bundle.test.ts).
// Runs against the BUILT output, as a browser bundler would load it (`pnpm run build` first).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { config, recordingLogger, sdkKey } from "./helpers.js";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(PKG, "dist/browser/index.js");
type Mod = typeof import("../src/index.js");
let m: Mod;
beforeAll(async () => {
  if (!existsSync(ENTRY)) throw new Error("dist/browser missing: run `pnpm run build` first");
  m = (await import(pathToFileURL(ENTRY).href)) as Mod;
});

const VECTORS = join(dirname(createRequire(import.meta.url).resolve("@productcraft/flags-engine/package.json")), "vectors");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vector JSON is untyped test data
const load = (p: string): any => JSON.parse(readFileSync(join(VECTORS, p), "utf8"));
const typed = (v: unknown) => JSON.stringify(v).includes('"$');

describe("browser build", () => {
  it("package.json maps `browser` and `react-native` to dist/browser for . and ./testing", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8"));
    for (const sub of [".", "./testing"]) {
      for (const cond of ["browser", "react-native"]) {
        expect(Object.keys(pkg.exports[sub])[0] === "browser" || Object.keys(pkg.exports[sub])[1] === "react-native").toBe(true);
        expect(pkg.exports[sub][cond].import.default).toMatch(/^\.\/dist\/browser\//);
        expect(pkg.exports[sub][cond].require.default).toMatch(/^\.\/dist\/browser\/.*\.cjs$/);
      }
    }
  });

  it("evaluates every engine vector in bootstrap mode", () => {
    let n = 0;
    for (const file of readdirSync(VECTORS).filter((f) => f.endsWith(".json"))) {
      for (const suite of load(file).suites ?? []) {
        const raw = suite.config ?? load(suite.config_ref);
        const snap = new m.FlagsClient({ bootstrap: raw, offline: true, logger: null }).snapshot();
        for (const c of suite.cases) {
          if (typed(c) || (c.default !== null && typeof c.default === "object") || c.default === null) continue;
          const d = snap.getValueDetails(c.key, c.default, c.user);
          expect([d.value, d.errorCode ?? null], `${file} ${suite.name}: ${c.name}`).toEqual([c.expect.value, c.expect.error_code ?? null]);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it("sends neither If-None-Match nor User-Agent from a page", async () => {
    const calls: RequestInit[] = [];
    const fetch = async (_: unknown, init?: RequestInit) => (calls.push(init!), new Response(JSON.stringify(config(1, { f: { type: "boolean", value: true } })), { headers: { etag: 'W/"a"' } }));
    const flags = new m.FlagsClient({ sdkKey: sdkKey(), polling: { mode: "manual" }, fetch: fetch as typeof globalThis.fetch, logger: null });
    await flags.forceRefresh();
    await flags.forceRefresh();
    expect(await flags.getValue("f", false)).toBe(true);
    for (const c of calls) expect(Object.keys(c.headers as object).map((h) => h.toLowerCase())).toEqual(["accept"]);
    flags.close();
  });

  it("reports file and env overrides as Node-only and keeps working", async () => {
    for (const overrides of [{ env: "X" }, { file: "./flags.json" }] as const) {
      const { lines, logger } = recordingLogger();
      const flags = new m.FlagsClient({ overrides, bootstrap: config(1, { f: { type: "boolean", value: true } }), offline: true, logger });
      await flags.waitForReady();
      expect(lines.join("\n")).toMatch(/Node-only/);
      expect(await flags.getValue("f", false)).toBe(true);
    }
  });

  describe("auto polling and page visibility", () => {
    let hidden = false;
    beforeAll(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    });
    afterEach(() => {
      vi.useRealTimers();
      hidden = false;
    });
    const flip = (h: boolean) => {
      hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    };

    it("pauses while the page is hidden and refreshes on return", async () => {
      vi.useFakeTimers();
      let n = 0;
      const fetch = async () => new Response(JSON.stringify(config(++n, { f: { type: "boolean", value: true } })));
      const flags = new m.FlagsClient({ sdkKey: sdkKey(), polling: { mode: "auto", intervalSeconds: 30 }, fetch: fetch as typeof globalThis.fetch, logger: null });
      await vi.advanceTimersByTimeAsync(0);
      await flags.waitForReady();
      expect(n).toBe(1);
      await vi.advanceTimersByTimeAsync(34_000);
      expect(n).toBe(2);
      flip(true);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(n).toBe(2);
      flip(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(n).toBe(3);
      await vi.advanceTimersByTimeAsync(34_000);
      expect(n).toBe(4);
      flags.close();
      flip(true);
      flip(false);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(n).toBe(4);
    });

    it("manual and lazy clients ignore visibility", async () => {
      let n = 0;
      const fetch = async () => (n++, new Response(JSON.stringify(config(1, {}))));
      const flags = new m.FlagsClient({ sdkKey: sdkKey(), polling: { mode: "manual" }, fetch: fetch as typeof globalThis.fetch, logger: null });
      flip(true);
      flip(false);
      await new Promise((r) => setTimeout(r, 10));
      expect(n).toBe(0);
      flags.close();
    });
  });
});

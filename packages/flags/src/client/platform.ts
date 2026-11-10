// The Node-only parts of FlagsClient: override files (read and watch) and environment variables.
// Everything runtime-specific sits behind this one module; the browser / React Native build swaps it
// for platform.browser.ts (tsup.config.ts, task 019), which has the same exports.
// `node:fs` is imported lazily, only when a file override is configured, so the main entry loads on
// runtimes without it (edge functions) as long as no file override is used.

import { isBrowser, readEnv, runtimeTag } from "@productcraft/core";
import { parseOverrideText } from "./overrides.js";

type Obj = Record<string, unknown>;

declare const __PC_SDK_VERSION__: string | undefined;
const VERSION = typeof __PC_SDK_VERSION__ === "string" ? __PC_SDK_VERSION__ : "0.0.0-dev";

/** Request headers for a config download: a User-Agent and the held ETag (none in a browser page, 6.3). */
export function deliveryHeaders(etag: string | null): Record<string, string> {
  // The Node entry can still end up in a page (a bundler without the `browser` condition).
  if (isBrowser()) return { Accept: "application/json" };
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": `productcraft-node/flags/${VERSION} ${runtimeTag()}` };
  if (etag) headers["If-None-Match"] = etag;
  return headers;
}
type Report = (message: string, cause?: unknown) => void;

/** `overrides.env`: the variable's JSON object (`{}` when unset). Throws on bad JSON. */
export function envOverrides(name: string): Obj {
  return parseOverrideText(readEnv(name) ?? "{}", `$${name}`);
}

/**
 * `overrides.file`: reads the file now (and on every change with `watch`), passing its values to
 * `apply` (null when it did not parse; reported). Returns a function that stops watching.
 */
export async function fileOverrides(path: string, watch: boolean | undefined, apply: (values: Obj | null) => void, report: Report, closed: () => boolean): Promise<(() => void) | undefined> {
  const load = async (): Promise<void> => {
    let text: string;
    try {
      text = await (await import("node:fs/promises")).readFile(path, "utf8");
    } catch (e) {
      return report("overrides file unreadable", e);
    }
    let values: Obj | null = null;
    try {
      values = parseOverrideText(text, "the overrides file");
    } catch (e) {
      report((e as Error).message, e);
    }
    apply(values);
  };
  await load();
  if (!watch || closed()) return undefined;
  try {
    const watcher = (await import("node:fs")).watch(path, { persistent: false }, () => void load());
    watcher.on("error", () => undefined);
    const stop = (): void => watcher.close();
    if (closed()) return stop(), undefined;
    return stop;
  } catch (e) {
    report("overrides file watch failed", e);
    return undefined;
  }
}

/** Page visibility (browser build only): Node has no page, so auto polling is never paused. */
export function watchVisibility(_onChange: (hidden: boolean) => void): (() => void) | undefined {
  return undefined;
}

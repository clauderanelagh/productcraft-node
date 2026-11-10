// platform.ts for the browser and React Native build (`browser` / `react-native` export conditions,
// task 019). tsup.config.ts swaps it in for platform.ts, so the browser bundle has no `node:` import,
// no `process.env` read and no override-file code. Override files and environment variables are
// Node-only: they report an `overrides` error. Auto polling pauses while the page is hidden.

import { isBrowser } from "@productcraft/core";

type Obj = Record<string, unknown>;
const NODE_ONLY = "overrides.file and overrides.env are Node-only; use overrides.values in a browser";

/**
 * Request headers for a config download. A page sends no If-None-Match: it would force a CORS
 * preflight, and the browser HTTP cache revalidates on its own (design 6.3). React Native has no
 * CORS and sends the held ETag. No User-Agent (browsers own that header).
 */
export function deliveryHeaders(etag: string | null): Record<string, string> {
  return etag && !isBrowser() ? { Accept: "application/json", "If-None-Match": etag } : { Accept: "application/json" };
}

export function envOverrides(_name: string): Obj {
  throw new Error(NODE_ONLY);
}

export async function fileOverrides(_path: string, _watch: boolean | undefined, _apply: (values: Obj | null) => void, report: (message: string) => void): Promise<undefined> {
  report(NODE_ONLY);
  return undefined;
}

/** Calls `onChange(hidden)` now and on every `visibilitychange`; returns a function that stops listening. Undefined without a `document` (React Native, workers). */
export function watchVisibility(onChange: (hidden: boolean) => void): (() => void) | undefined {
  type Doc = { visibilityState?: string; addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void };
  const d = (globalThis as { document?: Doc }).document;
  if (!d?.addEventListener) return undefined;
  const listener = (): void => onChange(d.visibilityState === "hidden");
  listener();
  d.addEventListener("visibilitychange", listener);
  return () => d.removeEventListener("visibilitychange", listener);
}

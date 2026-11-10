// The Node-only parts of FlagsClient: override files (read and watch) and environment variables.
// Everything Node-specific sits behind this one module, so a browser entry (task 019) can swap it out.
// `node:fs` is imported lazily, only when a file override is configured, so the main entry loads on
// runtimes without it (edge functions) as long as no file override is used.

import { readEnv } from "@productcraft/core";

/** The text of an environment variable, or undefined (no `process`, unset, or empty). */
export const envText = (name: string): string | undefined => readEnv(name);

/** Reads a UTF-8 file. */
export async function readText(path: string): Promise<string> {
  const fs = await import("node:fs/promises");
  return fs.readFile(path, "utf8");
}

/** Calls `onChange` when the file changes; returns a function that stops watching. */
export async function watchFile(path: string, onChange: () => void): Promise<() => void> {
  const fs = await import("node:fs");
  const watcher = fs.watch(path, { persistent: false }, () => onChange());
  watcher.on("error", () => undefined);
  return () => watcher.close();
}

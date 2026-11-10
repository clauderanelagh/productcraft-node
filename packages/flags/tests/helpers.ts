// Test helpers: well-formed SDK keys and a logger that records every line.
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i);
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A well-formed `pcf_sdk_` key with a valid checksum (the same algorithm as flags-api). */
export function sdkKey(seed = 0): string {
  let body = "";
  for (let i = 0; i < 32; i++) body += BASE62[(i * 7 + seed * 13 + 5) % 62];
  let n = crc32(body);
  let sum = "";
  do {
    sum = BASE62[n % 62] + sum;
    n = Math.floor(n / 62);
  } while (n > 0);
  return `pcf_sdk_${body}${sum.padStart(6, "0")}`;
}

/** Every line any logger wrote in this test file, to prove no line ever holds an SDK key. */
export const allLogLines: string[] = [];

export function recordingLogger() {
  const lines: string[] = [];
  const rec = (...args: unknown[]) => {
    const line = args.map((a) => (a instanceof Error ? `${a.message} ${String((a as { cause?: unknown }).cause ?? "")}` : String(a))).join(" ");
    lines.push(line);
    allLogLines.push(line);
  };
  return { lines, logger: { debug: rec, info: rec, warn: rec, error: rec } };
}

export const config = (revision: number, settings: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  schema: 1,
  revision,
  generation: 1,
  salt: "c2FsdA",
  segments: {},
  settings,
  ...extra,
});

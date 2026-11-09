// Attribute coercion and the SemVer 2.0.0 precedence (design 7.3).

const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === "[object Date]";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Text coercion: strings as is, numbers by ECMAScript Number::toString, booleans, Dates as unix seconds, string[] as compact JSON. */
export function toText(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (isDate(v)) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? String(ms / 1000) : null;
  }
  return isStringArray(v) ? JSON.stringify(v) : null;
}

const NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Number coercion: finite numbers; strings trimmed, the first `,` becomes `.`, strict grammar. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(",", ".");
  if (!NUMBER_TEXT.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Date coercion to unix seconds: a Date, a number, or a numeric string. ISO strings are not accepted in v1. */
export function toDate(v: unknown): number | null {
  if (isDate(v)) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? ms / 1000 : null;
  }
  return toNumber(v);
}

/** Array coercion: a string[] or a string holding a JSON array of strings. */
export function toArray(v: unknown): string[] | null {
  if (isStringArray(v)) return v;
  if (typeof v !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(v);
    return isStringArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export interface Semver {
  core: [string, string, string];
  pre: string[] | null;
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

/** SemVer 2.0.0, trimmed; a leading `v` is invalid; build metadata is dropped. */
export function parseSemver(v: unknown): Semver | null {
  if (typeof v !== "string") return null;
  const m = SEMVER.exec(v.trim());
  if (!m) return null;
  return { core: [m[1]!, m[2]!, m[3]!], pre: m[4] === undefined ? null : m[4].split(".") };
}

const isNum = (s: string): boolean => /^\d+$/.test(s);
// Numeric identifiers have no leading zeros, so a longer one is larger (no precision limit).
const cmpNum = (a: string, b: string): number => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);

/** SemVer precedence: negative, 0 or positive. */
export function compareSemver(a: Semver, b: Semver): number {
  for (let i = 0; i < 3; i++) {
    const c = cmpNum(a.core[i]!, b.core[i]!);
    if (c) return c;
  }
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i]!;
    const y = b.pre[i]!;
    const nx = isNum(x);
    const ny = isNum(y);
    const c = nx && ny ? cmpNum(x, y) : nx ? -1 : ny ? 1 : x < y ? -1 : x > y ? 1 : 0;
    if (c) return c;
  }
  return a.pre.length - b.pre.length;
}

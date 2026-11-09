// parseConfig: validates config JSON schema 1 and compiles it for evaluation.
// Prototype-safe: settings and segments live in Maps, every read of a config
// or user object is an own-property read, so `__proto__`, `constructor` and
// friends are ordinary keys.

import { utf8 } from "./sha.js";
import type { ParsedConfig, SettingType, SettingValue } from "./types.js";
import { parseSemver, type Semver } from "./values.js";

export type ConfigParseErrorCode = "PARSE_ERROR" | "UNSUPPORTED_SCHEMA";

/** Thrown by `parseConfig`. The caller keeps its last good config. */
export class ConfigParseError extends Error {
  readonly code: ConfigParseErrorCode;
  /** Where in the config the problem is, such as `settings.dark_mode.rules[0].serve`. */
  readonly path: string;
  constructor(code: ConfigParseErrorCode, path: string, message: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = "ConfigParseError";
    this.code = code;
    this.path = path;
  }
}

export interface Pct {
  percentage: number;
  value: SettingValue;
}

/** A compiled user condition. Exactly one of the value fields is set, per comparator family. */
export interface UserCond {
  k: "u";
  attribute: string;
  comparator: string;
  /** Comparator family, or null for an unknown comparator (a soft miss). */
  family: "text" | "semver" | "number" | "date" | "array" | "hashed" | "hashed_sliced" | "hashed_array" | null;
  negate: boolean;
  op: string;
  text?: string;
  set?: Set<string>;
  list?: string[];
  num?: number;
  semver?: Semver[];
  /** For hashed starts/ends with: byte length -> hashes. */
  sliced?: Map<number, Set<string>>;
  /** utf8(salt + context), appended to every hashed value. */
  saltContext?: number[];
}

export interface SegmentCond {
  k: "s";
  segment: Segment;
  comparator: string;
}

export interface PrereqCond {
  k: "p";
  setting: string;
  comparator: string;
  value: SettingValue;
}

export type Cond = UserCond | SegmentCond | PrereqCond;

export interface Segment {
  key: string;
  conditions: UserCond[];
}

export interface Rule {
  conditions: Cond[];
  serve: SettingValue | undefined;
  percentages: Pct[] | null;
}

export interface Setting {
  key: string;
  type: SettingType;
  value: SettingValue;
  seed: string;
  percentageAttribute: string;
  rules: Rule[];
  percentages: Pct[] | null;
}

export const COMPILED = Symbol.for("productcraft.flags-engine.compiled");

export interface Compiled {
  settings: Map<string, Setting>;
}

type Obj = Record<string, unknown>;

const has = (o: Obj, k: string): boolean => Object.hasOwn(o, k);
const get = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (path: string, message: string): never => {
  throw new ConfigParseError("PARSE_ERROR", path, message);
};
const sub = (path: string, key: string): string => (path ? `${path}.${key}` : key);
const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, "must be an object"));
/** An own string field; `def` when absent (undefined: required). */
const str = (o: Obj, k: string, path: string, def?: string | null): string => {
  const v = get(o, k) ?? def;
  return typeof v === "string" || (v === null && def === null) ? (v as string) : fail(sub(path, k), "must be a string");
};
const int = (o: Obj, k: string, min: number): number => {
  const v = get(o, k);
  return Number.isSafeInteger(v) && (v as number) >= min ? (v as number) : fail(k, `must be an integer >= ${min}`);
};

// comparator -> [family, negated, operation]. Ordered comparisons use the operations lt, lte, gt, gte.
const COMPARATORS = new Map<string, [NonNullable<UserCond["family"]>, boolean, string]>();
const define = (family: NonNullable<UserCond["family"]>, spec: string, suffix = "", prefix = ""): void => {
  for (const op of spec.split(" ")) {
    // "eq" pairs with "neq"; "x_y" with "not_x_y"; "semver_x"/"array_x" with "semver_not_x"/"array_not_x"; lt, lte, gt, gte have no negation.
    COMPARATORS.set(prefix + op + suffix, [family, false, op]);
    if (!/^[lg]te?$/.test(op)) COMPARATORS.set(prefix + (op === "eq" ? "neq" : op.replace(/^(semver_|array_)?/, "$1not_")) + suffix, [family, true, op]);
  }
};
define("text", "eq one_of contains_any starts_with_any ends_with_any");
define("semver", "semver_one_of");
define("semver", "lt lte gt gte", "", "semver_");
define("number", "eq lt lte gt gte", "", "num_");
COMPARATORS.set("before", ["date", false, "lt"]);
COMPARATORS.set("after", ["date", false, "gt"]);
define("array", "array_contains_any");
define("hashed", "eq one_of", "_hashed");
define("hashed_sliced", "starts_with_any ends_with_any", "_hashed");
define("hashed_array", "array_contains_any", "_hashed");

const SINGLE = /^(eq|[lg]te?)$/;
const HASH = /^(?:([1-9]\d{0,5})_)?([0-9a-f]{64})$/;

const VALUE_CHECKS: Record<SettingType, (v: unknown) => boolean> = {
  boolean: (v) => typeof v === "boolean",
  string: (v) => typeof v === "string",
  integer: Number.isSafeInteger,
  number: (v) => typeof v === "number" && Number.isFinite(v),
  json: (v) => typeof v === "string" && isJson(v),
};

function checkValue(type: SettingType, v: unknown, path: string): SettingValue {
  return VALUE_CHECKS[type](v) ? (v as SettingValue) : fail(path, `is not a ${type} value`);
}

function isJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

function percentages(raw: unknown, type: SettingType, path: string): Pct[] {
  if (!Array.isArray(raw) || !raw.length) fail(path, "must be a non-empty array");
  let sum = 0;
  const out = (raw as unknown[]).map((item, i) => {
    const p = `${path}[${i}]`;
    const o = obj(item, p);
    const pct = get(o, "percentage");
    if (!Number.isInteger(pct) || (pct as number) < 0 || (pct as number) > 100) fail(sub(p, "percentage"), "must be an integer 0-100");
    sum += pct as number;
    return { percentage: pct as number, value: checkValue(type, get(o, "value"), sub(p, "value")) };
  });
  if (sum !== 100) fail(path, `add up to ${sum}, not 100`);
  return out;
}

function strings(values: unknown[], path: string): string[] {
  values.forEach((v, i) => typeof v !== "string" && fail(`${path}[${i}]`, "must be a string"));
  return values as string[];
}

function userCondition(raw: unknown, path: string, salt: string, context: string): UserCond {
  const o = obj(raw, path);
  const attribute = str(o, "attribute", path) || fail(sub(path, "attribute"), "must not be empty");
  const comparator = str(o, "comparator", path);
  const values = get(o, "values");
  const vp = sub(path, "values");
  if (!Array.isArray(values) || values.length === 0) fail(vp, "must be a non-empty array");
  const vals = values as unknown[];
  const cmp = COMPARATORS.get(comparator);
  const c: UserCond = { k: "u", attribute, comparator, family: null, negate: false, op: "" };
  // An unknown comparator is not an error: it is a soft miss at evaluation, so adding comparators is additive.
  if (!cmp) return c;
  const [family, negate, op] = cmp;
  Object.assign(c, { family, negate, op });
  if (SINGLE.test(op) && vals.length !== 1) fail(vp, "must hold exactly one value");
  switch (family) {
    case "text":
    case "array": {
      const list = strings(vals, vp);
      if (op === "eq") c.text = list[0];
      else if (op === "one_of" || op === "array_contains_any") c.set = new Set(list);
      else c.list = list;
      break;
    }
    case "semver":
      c.semver = vals.map((v, i) => parseSemver(v) ?? fail(`${vp}[${i}]`, "is not a semantic version"));
      break;
    case "number":
    case "date":
      if (typeof vals[0] !== "number" || !Number.isFinite(vals[0])) fail(`${vp}[0]`, "must be a finite number");
      c.num = vals[0] as number;
      break;
    default: {
      const sliced = family === "hashed_sliced";
      if (sliced) c.sliced = new Map();
      else c.set = new Set();
      strings(vals, vp).forEach((v, i) => {
        const m = HASH.exec(v);
        if (!m || !m[1] !== !sliced) fail(`${vp}[${i}]`, sliced ? 'must be "<n>_" and 64 lowercase hex digits' : "must be 64 lowercase hex digits");
        if (!sliced) return void c.set!.add(v);
        const n = Number(m![1]);
        c.sliced!.set(n, (c.sliced!.get(n) ?? new Set<string>()).add(m![2]!));
      });
      c.saltContext = utf8(salt + context);
    }
  }
  return c;
}

function conditions(raw: unknown, path: string): Obj[] {
  if (!Array.isArray(raw)) fail(path, "must be an array");
  return (raw as unknown[]).map((c, i) => obj(c, `${path}[${i}]`));
}

/**
 * Parses and validates a config JSON (schema 1) body or object.
 * Throws `ConfigParseError` (`PARSE_ERROR`, or `UNSUPPORTED_SCHEMA` for any schema other than 1).
 * Unknown fields are ignored.
 */
export function parseConfig(input: string | object): ParsedConfig {
  let doc: unknown = input;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch (e) {
      fail("", `not JSON (${(e as Error).message})`);
    }
  }
  const root = obj(doc, "");
  const schema = get(root, "schema");
  if (!Number.isInteger(schema)) fail("schema", "must be an integer");
  if (schema !== 1) throw new ConfigParseError("UNSUPPORTED_SCHEMA", "schema", `schema ${String(schema)} is not supported`);
  const revision = int(root, "revision", 0);
  const generation = int(root, "generation", 1);
  const salt = str(root, "salt", "");

  let delivery: ParsedConfig["delivery"] = null;
  const d = get(root, "delivery");
  if (d != null) {
    const urls = get(obj(d, "delivery"), "base_urls") ?? [];
    if (!Array.isArray(urls)) fail("delivery.base_urls", "must be an array");
    delivery = Object.freeze({ baseUrls: Object.freeze(strings((urls as unknown[]).slice(), "delivery.base_urls")), mode: str(d as Obj, "mode", "delivery", "hint") });
  }

  const segments = new Map<string, Segment>();
  const segmentsRaw = obj(get(root, "segments") ?? {}, "segments");
  for (const key of Object.keys(segmentsRaw)) {
    const path = `segments.${key}`;
    const s = obj(segmentsRaw[key], path);
    const seed = str(s, "seed", path, key);
    const conds = conditions(get(s, "conditions"), sub(path, "conditions")).map((c, i) => {
      const p = `${path}.conditions[${i}]`;
      return has(c, "user") ? userCondition(c.user, sub(p, "user"), salt, seed) : fail(p, "must be a user condition");
    });
    segments.set(key, { key, conditions: conds });
  }

  const settings = new Map<string, Setting>();
  const settingsRaw = obj(get(root, "settings"), "settings");
  for (const key of Object.keys(settingsRaw)) {
    const path = `settings.${key}`;
    const s = obj(settingsRaw[key], path);
    const type = get(s, "type");
    if (typeof type !== "string" || !Object.hasOwn(VALUE_CHECKS, type)) fail(sub(path, "type"), "is not a setting type");
    const t = type as SettingType;
    const seed = str(s, "seed", path, key);
    const pa = str(s, "percentage_attribute", path, "identifier") || fail(sub(path, "percentage_attribute"), "must not be empty");
    const rulesRaw = get(s, "rules") ?? [];
    if (!Array.isArray(rulesRaw)) fail(sub(path, "rules"), "must be an array");
    const rules = (rulesRaw as unknown[]).map((raw, i): Rule => {
      const rp = `${path}.rules[${i}]`;
      const r = obj(raw, rp);
      const serve = get(r, "serve") ?? null;
      const pcts = get(r, "percentages") ?? null;
      if ((serve === null) === (pcts === null)) fail(rp, "must have exactly one of serve and percentages");
      const conds = conditions(get(r, "conditions"), sub(rp, "conditions")).map((c, j): Cond => {
        const cp = `${rp}.conditions[${j}]`;
        if (has(c, "user")) return userCondition(c.user, sub(cp, "user"), salt, seed);
        if (has(c, "segment")) {
          const sp = sub(cp, "segment");
          const sc = obj(c.segment, sp);
          const name = get(sc, "segment");
          const seg = typeof name === "string" ? segments.get(name) : undefined;
          return seg ? { k: "s", segment: seg, comparator: str(sc, "comparator", sp) } : fail(sub(sp, "segment"), "is not a segment of this config");
        }
        if (has(c, "prerequisite")) {
          const pp = sub(cp, "prerequisite");
          const pc = obj(c.prerequisite, pp);
          const value = get(pc, "value");
          if (!/^(boolean|string|number)$/.test(typeof value)) fail(sub(pp, "value"), "must be a boolean, string or number");
          return { k: "p", setting: str(pc, "setting", pp), comparator: str(pc, "comparator", pp), value: value as SettingValue };
        }
        return fail(cp, "must have one of user, segment and prerequisite");
      });
      return {
        conditions: conds,
        serve: serve === null ? undefined : checkValue(t, serve, sub(rp, "serve")),
        percentages: pcts === null ? null : percentages(pcts, t, sub(rp, "percentages")),
      };
    });
    const pcts = get(s, "percentages") ?? null;
    settings.set(key, {
      key,
      type: t,
      value: checkValue(t, get(s, "value"), sub(path, "value")),
      seed,
      percentageAttribute: pa,
      rules,
      percentages: pcts === null ? null : percentages(pcts, t, sub(path, "percentages")),
    });
  }

  const config: ParsedConfig = {
    schema: 1,
    revision,
    generation,
    publishedAt: str(root, "published_at", "", null),
    configId: str(root, "config_id", "", null),
    environmentId: str(root, "environment_id", "", null),
    salt,
    delivery,
    keys: () => [...settings.keys()],
    settingType: (key: string) => settings.get(key)?.type,
  };
  Object.defineProperty(config, COMPILED, { value: { settings } satisfies Compiled });
  return Object.freeze(config);
}

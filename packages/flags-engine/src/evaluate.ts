// evaluate / evaluateAll (design 7.1, 7.2): pure and synchronous.

import { COMPILED, type Compiled, type Cond, type Pct, type Setting, type UserCond } from "./parse.js";
import { sha1Hex, sha256Hex, utf8 } from "./sha.js";
import type { ConfigVersion, ErrorCode, EvaluationDetails, ParsedConfig, Reason, SettingValue, User, ValueFor, Warning, WarningCode } from "./types.js";
import { compareSemver, parseSemver, toArray, toDate, toNumber, toText } from "./values.js";

/** Prerequisite hops allowed below the evaluated key. */
export const MAX_PREREQUISITE_DEPTH = 16;

/** The percentage bucket, 0-99: `parseInt(hex(sha1(utf8(seed + value)))[0:7], 16) % 100`. */
export function bucket(seed: string, value: string): number {
  return parseInt(sha1Hex(utf8(seed + value)).slice(0, 7), 16) % 100;
}

/**
 * The confidential-comparator hash: `hex(sha256(utf8(value) + utf8(salt + context)))`.
 * With `slice`, only the first or last `bytes` UTF-8 bytes of the value are hashed and the result is `"<bytes>_<hex>"`.
 */
export function hashConfidential(value: string, salt: string, context: string, slice?: { from: "start" | "end"; bytes: number }): string {
  let bytes = utf8(value);
  if (slice) bytes = slice.from === "start" ? bytes.slice(0, slice.bytes) : bytes.slice(Math.max(0, bytes.length - slice.bytes));
  const digest = sha256Hex(bytes.concat(utf8(salt + context)));
  return slice ? `${slice.bytes}_${digest}` : digest;
}

/**
 * Whether a fetched config replaces the held one: always when there is none or the generation
 * differs (a database restore), else only when its revision is higher.
 */
export function isNewerConfig(held: ConfigVersion | null | undefined, incoming: ConfigVersion): boolean {
  return !held || held.generation !== incoming.generation || incoming.revision > held.revision;
}

class HardError {
  constructor(
    readonly code: ErrorCode,
    readonly message: string,
  ) {}
}

interface Ctx {
  compiled: Compiled;
  user: User | null;
  memo: Map<string, SettingValue>;
  stack: string[];
  warnings: Warning[];
}

interface Outcome {
  value: SettingValue;
  variant: string;
  reason: Reason;
  ruleIndex: number | null;
  percentageIndex: number | null;
}

const SOFT = -1;

function warn(ctx: Ctx, code: WarningCode, message: string, ruleIndex: number | null, attribute: string | null): typeof SOFT {
  ctx.warnings.push({ code, message, key: ctx.stack[ctx.stack.length - 1]!, ruleIndex, attribute });
  return SOFT;
}

/** Attribute lookup (design 7.2): own properties only; `custom[a]` before the top-level `a`. */
function attributeOf(user: User, a: string): unknown {
  if (a !== "identifier" && a !== "email" && a !== "country") {
    const custom = Object.hasOwn(user, "custom") ? user.custom : undefined;
    if (typeof custom === "object" && custom !== null && Object.hasOwn(custom, a)) return custom[a];
  }
  return Object.hasOwn(user, a) ? user[a] : undefined;
}

const hashOf = (bytes: number[], c: UserCond): string => sha256Hex(bytes.concat(c.saltContext!));

/** An ordered comparison (lt, lte, gt, gte) or equality (any other op) on a sign. */
const ordered = (op: string, sign: number): boolean =>
  op === "lt" ? sign < 0 : op === "lte" ? sign <= 0 : op === "gt" ? sign > 0 : op === "gte" ? sign >= 0 : sign === 0;

/** 1 = true, 0 = false, -1 = soft miss (warning recorded). */
function userCondition(ctx: Ctx, c: UserCond, ruleIndex: number | null): number {
  const a = c.attribute;
  const f = c.family;
  if (f === null) return warn(ctx, "unknown_comparator", `unknown comparator ${c.comparator}`, ruleIndex, a);
  if (!ctx.user) return warn(ctx, "missing_user", "no user", ruleIndex, a);
  const raw = attributeOf(ctx.user, a);
  if (raw === undefined || raw === null || raw === "") return warn(ctx, "missing_attribute", `${a} is missing`, ruleIndex, a);
  const op = c.op;
  let hit: boolean | undefined;
  if (f === "array" || f === "hashed_array") {
    const arr = toArray(raw);
    hit = arr?.some((x) => c.set!.has(f === "array" ? x : hashOf(utf8(x), c)));
  } else if (f === "semver") {
    const v = parseSemver(raw);
    hit = v ? c.semver!.some((x) => ordered(op, compareSemver(v, x))) : undefined;
  } else if (f === "number" || f === "date") {
    const n = f === "number" ? toNumber(raw) : toDate(raw);
    hit = n === null ? undefined : ordered(op, n - c.num!);
  } else {
    const t = toText(raw);
    if (t !== null) {
      if (f === "text") {
        hit =
          op === "eq"
            ? t === c.text
            : op === "one_of"
              ? c.set!.has(t)
              : c.list!.some((v) => (op === "contains_any" ? t.includes(v) : op === "starts_with_any" ? t.startsWith(v) : t.endsWith(v)));
      } else if (f === "hashed") hit = c.set!.has(hashOf(utf8(t), c));
      else {
        const bytes = utf8(t);
        hit = false;
        for (const [n, set] of c.sliced!) {
          if (bytes.length >= n && set.has(hashOf(op === "starts_with_any" ? bytes.slice(0, n) : bytes.slice(bytes.length - n), c))) hit = true;
        }
      }
    }
  }
  if (hit === undefined) return warn(ctx, "invalid_attribute", `${a} is not valid for ${c.comparator}`, ruleIndex, a);
  return hit !== c.negate ? 1 : 0;
}

function condition(ctx: Ctx, c: Cond, ruleIndex: number): number {
  if (c.k === "u") return userCondition(ctx, c, ruleIndex);
  if (c.k === "s") {
    if (c.comparator !== "in" && c.comparator !== "not_in") return warn(ctx, "unknown_comparator", `unknown comparator ${c.comparator}`, ruleIndex, null);
    for (const uc of c.segment.conditions) {
      const r = userCondition(ctx, uc, ruleIndex);
      if (r === SOFT) return SOFT; // neither in nor not_in matches
      if (r === 0) return c.comparator === "in" ? 0 : 1;
    }
    return c.comparator === "in" ? 1 : 0;
  }
  if (c.comparator !== "eq" && c.comparator !== "neq") return warn(ctx, "unknown_comparator", `unknown comparator ${c.comparator}`, ruleIndex, null);
  const value = prerequisite(ctx, c.setting);
  return (value === c.value) === (c.comparator === "eq") ? 1 : 0;
}

function prerequisite(ctx: Ctx, key: string): SettingValue {
  const s = ctx.compiled.settings.get(key);
  const chain = (): string => [...ctx.stack, key].join(" -> ");
  if (!s) throw new HardError("PREREQUISITE_NOT_FOUND", `${chain()}: ${key} is not in the config`);
  if (ctx.stack.includes(key)) throw new HardError("PREREQUISITE_CYCLE", `cycle ${chain()}`);
  // Depth is checked before the memo, so the outcome depends only on the path, not on evaluation order.
  if (ctx.stack.length > MAX_PREREQUISITE_DEPTH) throw new HardError("PREREQUISITE_DEPTH", `deeper than ${MAX_PREREQUISITE_DEPTH}: ${chain()}`);
  const memo = ctx.memo.get(key);
  return memo !== undefined ? memo : run(ctx, s).value;
}

/** The option index for this user, or -1 when the percentage attribute is missing (split skipped). */
function split(ctx: Ctx, s: Setting, pcts: Pct[], ruleIndex: number | null): number {
  const a = s.percentageAttribute;
  const raw = ctx.user ? attributeOf(ctx.user, a) : undefined;
  const text = raw === undefined || raw === null ? null : toText(raw);
  if (text === null || text === "") return warn(ctx, "missing_percentage_attribute", `${a} is missing; split skipped`, ruleIndex, a);
  const b = bucket(s.seed, text);
  let cumulative = 0;
  for (let j = 0; j < pcts.length; j++) {
    cumulative += pcts[j]!.percentage;
    if (b < cumulative) return j;
  }
  return -1; // unreachable: percentages add up to 100
}

/** Evaluates one setting (prerequisites memoised per top-level call). Throws HardError for prerequisite problems. */
function run(ctx: Ctx, s: Setting): Outcome {
  ctx.stack.push(s.key);
  try {
    const out = decide(ctx, s);
    ctx.memo.set(s.key, out.value);
    return out;
  } finally {
    ctx.stack.pop();
  }
}

function decide(ctx: Ctx, s: Setting): Outcome {
  for (let i = 0; i < s.rules.length; i++) {
    const rule = s.rules[i]!;
    let matched = true;
    for (const c of rule.conditions) {
      if (condition(ctx, c, i) !== 1) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    if (rule.percentages === null) return { value: rule.serve!, variant: `rule:${i}`, reason: "TARGETING_MATCH", ruleIndex: i, percentageIndex: null };
    const j = split(ctx, s, rule.percentages, i);
    if (j >= 0) return { value: rule.percentages[j]!.value, variant: `rule:${i}/pct:${j}`, reason: "SPLIT", ruleIndex: i, percentageIndex: j };
  }
  if (s.percentages) {
    const j = split(ctx, s, s.percentages, null);
    if (j >= 0) return { value: s.percentages[j]!.value, variant: `pct:${j}`, reason: "SPLIT", ruleIndex: null, percentageIndex: j };
  }
  return { value: s.value, variant: "default", reason: s.rules.length === 0 && !s.percentages ? "STATIC" : "DEFAULT", ruleIndex: null, percentageIndex: null };
}

function compiledOf(config: ParsedConfig): Compiled {
  const c = (config as unknown as Record<symbol, Compiled | undefined>)[COMPILED];
  if (!c) throw new TypeError("evaluate() takes a config returned by parseConfig()");
  return c;
}

const TYPE_OF: Record<string, string> = { boolean: "boolean", string: "string", json: "string", integer: "number", number: "number" };

function details<D>(ctx: Ctx, config: ParsedConfig, key: string, defaultValue: D): EvaluationDetails<ValueFor<D>> {
  const error = (code: ErrorCode, message: string): EvaluationDetails<ValueFor<D>> => ({
    key,
    value: defaultValue as ValueFor<D>,
    variant: null,
    reason: "ERROR",
    errorCode: code,
    errorMessage: message,
    ruleIndex: null,
    percentageIndex: null,
    isDefaultValue: true,
    revision: config.revision,
    warnings: ctx.warnings,
  });
  const s = ctx.compiled.settings.get(key);
  if (!s) return error("FLAG_NOT_FOUND", `${key} is not in the config`);
  if (defaultValue !== null && defaultValue !== undefined && typeof defaultValue !== TYPE_OF[s.type]) {
    return error("TYPE_MISMATCH", `${key} is ${s.type}, the default is ${typeof defaultValue}`);
  }
  try {
    const o = run(ctx, s);
    return { key, ...o, value: o.value as ValueFor<D>, errorCode: null, errorMessage: null, isDefaultValue: false, revision: config.revision, warnings: ctx.warnings };
  } catch (e) {
    if (e instanceof HardError) return error(e.code, e.message);
    return error("GENERAL", e instanceof Error ? e.message : String(e));
  }
}

const context = (config: ParsedConfig, user: User | null | undefined): Ctx => ({
  compiled: compiledOf(config),
  user: user ?? null,
  memo: new Map(),
  stack: [],
  warnings: [],
});

/**
 * Evaluates one setting for a user, locally. Never throws for user data or a missing key:
 * a hard error returns `defaultValue` with reason `ERROR` and an `errorCode`.
 */
export function evaluate<D extends SettingValue | null | undefined>(
  config: ParsedConfig,
  key: string,
  defaultValue: D,
  user?: User | null,
): EvaluationDetails<ValueFor<D>> {
  return details(context(config, user), config, key, defaultValue);
}

/** Evaluates every setting of the config for a user, in config order (no caller default: errors return null). */
export function evaluateAll(config: ParsedConfig, user?: User | null): EvaluationDetails[] {
  return config.keys().map((key) => details(context(config, user), config, key, null) as EvaluationDetails);
}

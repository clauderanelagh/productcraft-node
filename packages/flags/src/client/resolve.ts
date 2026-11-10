// From an engine evaluation to what getValue / getJson / getValueDetails return (design 8.2):
// json settings parse for object, array and null defaults (and always in getJson), errors return the
// caller's default, and the client layer marks values served from the cache or a stale copy.

import { evaluate, type EvaluationDetails, type ParsedConfig, type Reason, type User } from "@productcraft/flags-engine";

export type Layer = "CACHED" | "STALE" | null;

const fail = <T>(base: EvaluationDetails<unknown>, def: T, code: EvaluationDetails["errorCode"], message: string): EvaluationDetails<T> => ({
  ...base,
  value: def,
  variant: null,
  reason: "ERROR",
  errorCode: code,
  errorMessage: message,
  ruleIndex: null,
  percentageIndex: null,
  isDefaultValue: true,
});

/** Evaluates one key. `json`: always parse (getJson). Never throws. */
export function resolve<T>(config: ParsedConfig | null, key: string, def: T, user: User | null | undefined, json: boolean, layer: Layer): EvaluationDetails<T> {
  const empty: EvaluationDetails<unknown> = {
    key, value: def, variant: null, reason: "ERROR", errorCode: null, errorMessage: null,
    ruleIndex: null, percentageIndex: null, isDefaultValue: true, revision: config?.revision ?? 0, warnings: [],
  };
  if (!config) return fail(empty, def, "PROVIDER_NOT_READY", "no config yet");
  try {
    const parse = json || def === null || def === undefined || typeof def === "object";
    const d = evaluate(config, key, (parse ? null : def) as never, user ?? null) as EvaluationDetails<unknown>;
    if (d.reason === "ERROR") return { ...d, value: def, isDefaultValue: true };
    const type = config.settingType(key);
    let value = d.value;
    if (parse) {
      const parsable = type === "json" || (json && type === "string");
      if (!parsable && (json || (def !== null && def !== undefined))) {
        return fail(d, def, "TYPE_MISMATCH", `${key} is ${type}`);
      }
      if (parsable) {
        try {
          value = JSON.parse(d.value as string);
        } catch (e) {
          return fail(d, def, "PARSE_ERROR", (e as Error).message);
        }
      }
    }
    return { ...d, value: value as T, reason: layer ?? (d.reason as Reason) };
  } catch (e) {
    return fail(empty, def, "GENERAL", (e as Error)?.message ?? String(e));
  }
}

/** Every setting's value for a user, json settings parsed (a json parse failure gives null). */
export function resolveAll(config: ParsedConfig | null, user: User | null | undefined, layer: Layer): EvaluationDetails<unknown>[] {
  return config ? config.keys().map((k) => resolve<unknown>(config, k, null, user, false, layer)) : [];
}

/** A null-prototype map of key -> value, so a `__proto__` key is an ordinary entry. */
export function toValues(details: EvaluationDetails<unknown>[]): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const d of details) out[d.key] = d.value;
  return out;
}

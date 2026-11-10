// Overrides (design 8.2): turn a map of key -> value into config settings and combine them with the
// downloaded config per behaviour. Only own keys are read and every key is defined with
// defineProperty, so `__proto__` and friends stay ordinary keys.

import type { SettingType } from "@productcraft/flags-engine";
import type { OverrideBehaviour } from "./types.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
/** Defines an own, enumerable key (so `__proto__` is an ordinary key) and returns the object. */
export const put = (o: Obj, k: string, v: unknown): Obj => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

/** Parses override JSON text (a file or an environment variable): it must hold a JSON object. */
export function parseOverrideText(text: string, source: string): Obj {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new Error(`${source}: ${(e as Error).message}`);
  }
  if (!isObj(doc)) throw new Error(`${source}: not a JSON object`);
  return doc;
}

/** One override as a config setting, typed after the value (and after the remote setting where they agree). */
function toSetting(value: unknown, remote: SettingType | undefined): Obj | null {
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "string") return remote === "json" ? { type: "json", value } : { type: "string", value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return { type: remote !== "number" && Number.isSafeInteger(value) ? "integer" : "number", value };
  }
  if (value === null || typeof value === "object") {
    try {
      return { type: "json", value: JSON.stringify(value) };
    } catch {
      return null;
    }
  }
  return null;
}

/** The settings map for a set of overrides; values that cannot be a setting (undefined, NaN, functions) are skipped and named in `skipped`. */
export function overrideSettings(values: Obj, remoteType: (key: string) => SettingType | undefined): { settings: Obj; skipped: string[] } {
  const settings: Obj = {};
  const skipped: string[] = [];
  for (const key of Object.keys(values)) {
    const s = toSetting(values[key], remoteType(key));
    if (s) put(settings, key, s);
    else skipped.push(key);
  }
  return { settings, skipped };
}

/** The config the client evaluates: the download, the overrides, or both combined per `behaviour`. */
export function combine(remote: Obj | null, overrides: Obj | null, behaviour: OverrideBehaviour): Obj | null {
  if (!overrides) return remote;
  const local = { schema: 1, revision: 0, generation: 1, salt: "", segments: {}, settings: overrides };
  if (behaviour === "local_only" || !remote) return local;
  const settings: Obj = {};
  const remoteSettings = isObj(remote.settings) ? remote.settings : {};
  const [first, second] = behaviour === "local_over_remote" ? [remoteSettings, overrides] : [overrides, remoteSettings];
  for (const k of Object.keys(first)) put(settings, k, first[k]);
  for (const k of Object.keys(second)) put(settings, k, second[k]);
  return { ...remote, settings };
}

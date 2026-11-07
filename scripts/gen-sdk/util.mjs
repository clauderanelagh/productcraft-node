// Naming, sample values and source-printing helpers for scripts/gen-sdk.mjs.
// Everything here is pure and deterministic: same input, same bytes.

export const pascal = (s) =>
  String(s)
    .replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
export const camel = (s) => {
  const p = pascal(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
};

// Plural nouns we keep as they are (a "stats" resource is not one "stat").
const UNCOUNTABLE = new Set(["stats", "settings", "metrics", "status", "analytics", "news", "details", "data", "media", "series", "access", "credits"]);
/** Singular of one camelCase resource segment: `entries` → `entry`, `webhooks` → `webhook`. */
export function singular(word) {
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ss|x|ch|sh|z)es$/.test(word)) return word.slice(0, -2);
  if (/(ss|us|is)$/.test(word)) return word;
  if (/s$/.test(word)) return word.slice(0, -1);
  return word;
}
/** Type-name stem of a dotted resource: `webhooks.endpoints` → `WebhookEndpoint`. */
export const typeStem = (resource) => resource.split(".").map((s) => pascal(singular(s))).join("");

export const IDENT = /^[a-z][A-Za-z0-9]*$/;

/** JSON with sorted keys, so manifests and goldens never depend on insertion order. */
export function stableJson(value, indent = 2) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v;
  return JSON.stringify(sort(value), null, indent) + "\n";
}

/** A TypeScript expression that `tsLiteral` prints verbatim (an example `new File(…)`). */
export class Code {
  constructor(code) {
    this.code = code;
  }
}

const SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** A value as a TypeScript literal (keys unquoted where legal), on one line when short. */
export function tsLiteral(value, indent = "") {
  const one = (v) => {
    if (v instanceof Code) return v.code;
    if (v === undefined) return "undefined";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(one).join(", ")}]`;
    const entries = Object.entries(v).map(([k, x]) => `${SAFE_KEY.test(k) ? k : JSON.stringify(k)}: ${one(x)}`);
    return entries.length ? `{ ${entries.join(", ")} }` : "{}";
  };
  const flat = one(value);
  if (flat.length <= 90 || value === null || typeof value !== "object" || value instanceof Code) return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((x) => inner + tsLiteral(x, inner)).join(",\n")},\n${indent}]`;
  const lines = Object.entries(value).map(([k, x]) => `${inner}${SAFE_KEY.test(k) ? k : JSON.stringify(k)}: ${tsLiteral(x, inner)}`);
  return `{\n${lines.join(",\n")},\n${indent}}`;
}

/** A JSDoc block. Lines are escaped so a spec description cannot close the comment. */
export function jsdoc(lines, ind = "") {
  const body = lines
    .filter((l) => l !== undefined && l !== null && l !== false)
    .flatMap((l) => String(l).replace(/\*\//g, "*\\/").split("\n"));
  while (body.length && body[body.length - 1] === "") body.pop();
  if (!body.length) return "";
  return `${ind}/**\n${body.map((l) => `${ind} *${l ? " " + l : ""}`).join("\n")}\n${ind} */\n`;
}

/** The productcraft.co API reference anchor (apps/productcraft-co/lib/openapi.ts anchorId). */
export const anchorId = (method, path) =>
  `${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Deterministic placeholder UUIDs for parameters without an example. */
const UUIDS = [
  "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b",
  "3f0c1a2b-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
  "5d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6",
  "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
];
export const placeholderUuid = (i) => UUIDS[i % UUIDS.length];

/**
 * A sample value for a schema, from `example`/`default`/`enum` first, then by type.
 * `mode: "request"` keeps only required properties (what a caller must send);
 * `mode: "response"` fills every property (what a mock returns).
 */
export function sample(schema, deref, mode = "response", depth = 0, seen = new Set()) {
  if (!schema || depth > 12) return null; // recursion is cut by `seen`; this only bounds pathological nesting
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return mode === "response" ? null : {};
    const next = new Set(seen).add(schema.$ref);
    return sample(deref(schema), deref, mode, depth + 1, next);
  }
  if (schema.example !== undefined) return structuredClone(schema.example);
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.allOf) {
    // `allOf: [{ $ref: SomeEnum }]` (how Nest documents a described enum property) samples
    // to that member's value; only object members are merged.
    const parts = schema.allOf.map((s) => sample(s, deref, mode, depth + 1, seen));
    const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    const scalar = parts.find((v) => v !== null && !isObj(v));
    if (scalar !== undefined) return scalar;
    const objects = parts.filter(isObj);
    return objects.length ? Object.assign({}, ...objects) : null;
  }
  // An object that lists its properties and adds `oneOf` only for which of them go together
  // (Mail's html / text / template): sample the object with the first branch's required fields,
  // from the object's own (exampled) property schemas, so the example satisfies the rule.
  if (schema.properties && (schema.oneOf || schema.anyOf)) {
    const branch = (schema.oneOf ?? schema.anyOf).find((b) => b && b.type !== "null") ?? {};
    const required = [...new Set([...(schema.required ?? []), ...(deref(branch)?.required ?? [])])];
    const { oneOf: _o, anyOf: _a, ...rest } = schema;
    return sample({ ...rest, required }, deref, mode, depth, seen);
  }
  for (const k of ["oneOf", "anyOf"]) {
    if (schema[k]) {
      const first = schema[k].find((s) => s.type !== "null") ?? schema[k][0];
      return sample(first, deref, mode, depth + 1, seen);
    }
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
  if (type === "object" || schema.properties) {
    const out = {};
    const required = new Set(schema.required ?? []);
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      if (mode === "request" && !required.has(k)) continue;
      out[k] = sample(v, deref, mode, depth + 1, seen);
    }
    return out;
  }
  if (type === "array") return [sample(schema.items ?? {}, deref, mode, depth + 1, seen)];
  if (type === "integer" || type === "number") return schema.minimum ?? 1;
  if (type === "boolean") return true;
  if (type === "string") {
    switch (schema.format) {
      case "uuid":
        return placeholderUuid(0);
      case "date-time":
        return "2026-01-01T00:00:00.000Z";
      case "date":
        return "2026-01-01";
      case "email":
        return "ada@example.com";
      case "uri":
      case "url":
        return "https://example.com";
      default:
        return "string";
    }
  }
  return null;
}

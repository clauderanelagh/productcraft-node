// The public surface: ParsedConfig, ConfigParseError, details shape, warnings, isNewerConfig,
// the JSON Schema, and the package's purity rules (no I/O, no timers, no node: imports).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { ConfigParseError, MAX_PREREQUISITE_DEPTH, evaluate, evaluateAll, isNewerConfig, parseConfig } from "../src/index.js";

const ROOT = join(__dirname, "..");
const base = {
  schema: 1,
  revision: 7,
  generation: 2,
  published_at: "2026-11-08T14:02:11Z",
  config_id: "c",
  environment_id: "e",
  salt: "s",
  delivery: { base_urls: ["https://api.flags.productcraft.co"], mode: "hint" },
  future_field: { ignored: true },
  segments: {},
  settings: {
    b: { type: "boolean", value: true, future: 1 },
    s: { type: "string", value: "x", rules: [{ conditions: [{ prerequisite: { setting: "p", comparator: "eq", value: "on" } }], serve: "y" }] },
    p: { type: "string", value: "off", rules: [{ conditions: [{ user: { attribute: "plan", comparator: "eq", values: ["pro"] } }], serve: "on" }] },
  },
};

describe("parseConfig", () => {
  const c = parseConfig(JSON.stringify(base));
  it("exposes revision, generation, ids, salt and delivery; ignores unknown fields", () => {
    expect(c).toMatchObject({ schema: 1, revision: 7, generation: 2, publishedAt: "2026-11-08T14:02:11Z", configId: "c", environmentId: "e", salt: "s" });
    expect(c.delivery).toEqual({ baseUrls: ["https://api.flags.productcraft.co"], mode: "hint" });
    expect(c.keys()).toEqual(["b", "s", "p"]);
    expect(c.settingType("s")).toBe("string");
    expect(c.settingType("constructor")).toBeUndefined();
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.delivery)).toBe(true);
  });
  it("defaults delivery to null and the optional ids to null", () => {
    const m = parseConfig({ schema: 1, revision: 0, generation: 1, salt: "", settings: {} });
    expect([m.delivery, m.publishedAt, m.configId, m.environmentId]).toEqual([null, null, null, null]);
  });
  it("throws ConfigParseError with a code and a path", () => {
    const bad = { ...base, settings: { x: { type: "boolean", value: false, rules: [{ conditions: [], serve: "no" }] } } };
    try {
      parseConfig(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigParseError);
      expect(e).toBeInstanceOf(Error);
      expect((e as ConfigParseError).code).toBe("PARSE_ERROR");
      expect((e as ConfigParseError).path).toBe("settings.x.rules[0].serve");
      expect((e as ConfigParseError).name).toBe("ConfigParseError");
    }
    expect(() => parseConfig({ ...base, schema: 2 })).toThrow(expect.objectContaining({ code: "UNSUPPORTED_SCHEMA", path: "schema" }));
  });
  it("evaluate() refuses an object that did not come from parseConfig", () => {
    expect(() => evaluate({ ...c }, "b", false)).toThrow(TypeError);
  });
});

describe("evaluate details", () => {
  const c = parseConfig(base);
  it("carries key, variant, revision and isDefaultValue", () => {
    expect(evaluate(c, "b", false)).toEqual({
      key: "b", value: true, variant: "default", reason: "STATIC", errorCode: null, errorMessage: null, ruleIndex: null, percentageIndex: null, isDefaultValue: false, revision: 7, warnings: [],
    });
    const err = evaluate(c, "nope", "d");
    expect(err).toMatchObject({ value: "d", variant: null, reason: "ERROR", errorCode: "FLAG_NOT_FOUND", isDefaultValue: true, revision: 7 });
    expect(err.errorMessage).toContain("nope");
  });
  it("records warnings with the key they came from (a prerequisite's own key)", () => {
    const d = evaluate(c, "s", "", { identifier: "u" });
    expect(d.value).toBe("x");
    expect(d.warnings).toEqual([{ code: "missing_attribute", message: expect.any(String), key: "p", ruleIndex: 0, attribute: "plan" }]);
  });
  it("evaluateAll returns every key in config order with null defaults", () => {
    const all = evaluateAll(c, { plan: "pro" });
    expect(all.map((d) => [d.key, d.value, d.reason])).toEqual([["b", true, "STATIC"], ["s", "y", "TARGETING_MATCH"], ["p", "on", "TARGETING_MATCH"]]);
  });
  it("types the value from the default", () => {
    const flag: boolean = evaluate(c, "b", false).value;
    const text: string = evaluate(c, "s", "").value;
    expect([flag, text]).toEqual([true, "x"]);
  });
  it("exports the prerequisite depth limit", () => expect(MAX_PREREQUISITE_DEPTH).toBe(16));
});

describe("isNewerConfig", () => {
  it("accepts the first config, a higher revision, or any other generation", () => {
    expect(isNewerConfig(null, { revision: 1, generation: 1 })).toBe(true);
    expect(isNewerConfig({ revision: 5, generation: 1 }, { revision: 6, generation: 1 })).toBe(true);
    expect(isNewerConfig({ revision: 5, generation: 1 }, { revision: 5, generation: 1 })).toBe(false);
    expect(isNewerConfig({ revision: 5, generation: 1 }, { revision: 4, generation: 1 })).toBe(false);
    expect(isNewerConfig({ revision: 42, generation: 1 }, { revision: 3, generation: 2 })).toBe(true);
  });
});

describe("config.schema.json", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "schema/config.schema.json"), "utf8")));
  const configs = readdirSync(join(ROOT, "vectors/configs")).map((f) => [f, JSON.parse(readFileSync(join(ROOT, "vectors/configs", f), "utf8"))] as const);
  const inline = ["evaluation.json"].flatMap((f) => JSON.parse(readFileSync(join(ROOT, "vectors", f), "utf8")).suites.map((s: { name: string; config: unknown }) => [s.name, s.config] as const));
  for (const [name, config] of [...configs, ...inline]) {
    it(`accepts ${name}`, () => {
      expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
    });
  }
  it("rejects schema 2, generation 0, a rule with both serve and percentages", () => {
    const ok = JSON.parse(readFileSync(join(ROOT, "vectors/configs/flags-api-design-5-example.json"), "utf8"));
    expect(validate({ ...ok, schema: 2 })).toBe(false);
    expect(validate({ ...ok, generation: 0 })).toBe(false);
    expect(validate({ ...ok, settings: { x: { type: "boolean", value: false, rules: [{ conditions: [], serve: true, percentages: [{ percentage: 100, value: true }] }] } } })).toBe(false);
    expect(validate({ ...ok, settings: { x: { type: "integer", value: 1.5 } } })).toBe(false);
  });
});

describe("purity", () => {
  const src = readdirSync(join(ROOT, "src")).map((f) => readFileSync(join(ROOT, "src", f), "utf8")).join("\n");
  it("has no I/O, timers, node: imports or dependencies", () => {
    expect(src).not.toMatch(/from "node:|require\(|\bfetch\(|setTimeout|setInterval|\bprocess\.[a-z]|globalThis|crypto\.[a-z]/);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });
  it("publishes SPEC.md, the schema and the vectors", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    expect(pkg.files).toEqual(expect.arrayContaining(["dist/**", "schema/**", "vectors/**", "SPEC.md"]));
  });
});

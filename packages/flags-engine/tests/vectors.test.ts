// Runs every vector file in vectors/ (format 1, design 7.6) against the engine source.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bucket, evaluate, hashConfidential, isNewerConfig, parseConfig, ConfigParseError, type ParsedConfig } from "../src/index.js";

const DIR = join(__dirname, "..", "vectors");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vector JSON is untyped test data
const load = (p: string): any => JSON.parse(readFileSync(join(DIR, p), "utf8"));

/** Typed attributes: {"$date": ISO} and {"$int": "…"}; everything else is JSON as is. */
function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "$date") return new Date((v as { $date: string }).$date);
    if (keys.length === 1 && keys[0] === "$int") return Number((v as { $int: string }).$int);
    const out: Record<string, unknown> = {};
    for (const k of keys) Object.defineProperty(out, k, { value: decode((v as Record<string, unknown>)[k]), enumerable: true, writable: true, configurable: true });
    return out;
  }
  return v;
}

it("ships the vector files", () => {
  expect(files).toEqual(["client.json", "comparators.json", "evaluation.json", "hash.json", "invalid-configs.json", "renderer.json"]);
});

for (const file of files) {
  const doc = load(file);
  describe(file, () => {
    it("is format 1 for engine schema 1", () => {
      expect(doc.format).toBe(1);
      expect(doc.engine_schema).toBe(1);
    });

    for (const row of doc.hash?.bucket ?? []) {
      it(`bucket(${JSON.stringify(row.seed)}, ${JSON.stringify(row.value)}) = ${row.expect}`, () => expect(bucket(row.seed, row.value)).toBe(row.expect));
    }
    for (const row of doc.hash?.distribution ?? []) {
      it(`distribution ${row.seed} ${row.values.prefix}${row.values.from}..${row.values.to} below ${row.below}`, () => {
        let n = 0;
        for (let i = row.values.from; i <= row.values.to; i++) if (bucket(row.seed, `${row.values.prefix}${i}`) < row.below) n++;
        expect(n).toBe(row.expect_count);
      });
    }
    for (const row of doc.hash?.confidential ?? []) {
      it(`hashConfidential(${JSON.stringify(row.value)}, …, ${JSON.stringify(row.context)}${row.slice ? `, ${row.slice} ${row.bytes}` : ""})`, () => {
        expect(hashConfidential(row.value, row.salt, row.context, row.slice ? { from: row.slice, bytes: row.bytes } : undefined)).toBe(row.expect);
      });
    }

    for (const suite of doc.suites ?? []) {
      describe(suite.name, () => {
        const raw = suite.config ?? load(suite.config_ref);
        // The same config through both input paths: the response text and an object.
        const configs: Array<[string, ParsedConfig]> = [
          ["text", parseConfig(JSON.stringify(raw))],
          ["object", parseConfig(raw)],
        ];
        for (const c of suite.cases) {
          it(c.name, () => {
            for (const [, config] of configs) {
              const user = c.user === null ? null : (decode(c.user) as Record<string, unknown>);
              const d = evaluate(config, c.key, decode(c.default) as never, user);
              const e = c.expect;
              const got: Record<string, unknown> = {
                value: d.value,
                reason: d.reason,
                rule_index: d.ruleIndex,
                percentage_index: d.percentageIndex,
                error_code: d.errorCode,
                is_default_value: d.isDefaultValue,
                variant: d.variant,
                warnings: d.warnings.map((w) => w.code),
              };
              for (const k of Object.keys(e)) expect(got[k], `${k} of ${c.key}`).toEqual(decode(e[k]));
              expect(d.key).toBe(c.key);
              expect(d.revision).toBe(raw.revision);
            }
          });
        }
      });
    }

    for (const row of doc.invalid_configs ?? []) {
      it(`rejects: ${row.name}`, () => {
        const text = typeof row.body === "string" ? row.body : JSON.stringify(row.body);
        let err: unknown;
        try {
          parseConfig(text);
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(ConfigParseError);
        expect((err as ConfigParseError).code).toBe(row.expect_error);
      });
    }

    for (const t of doc.client ?? []) {
      it(`client transcript: ${t.name} (accept/ignore decisions)`, () => {
        let held: ParsedConfig | null = null;
        for (const step of t.steps) {
          const r = step.response;
          let accepted = false;
          if (r.status === 200 && r.body !== undefined) {
            try {
              const next = parseConfig(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
              if (isNewerConfig(held, next)) {
                held = next;
                accepted = true;
              }
            } catch (e) {
              expect((e as ConfigParseError).code).toBe(step.expect.error);
            }
          }
          expect(accepted).toBe(step.expect.accepted);
          expect(held && { revision: held.revision, generation: held.generation }).toEqual(step.expect.held);
          if (step.expect.base_urls) {
            const kept = held!.delivery!.baseUrls.filter((u) => /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.productcraft\.co$/.test(u));
            expect(kept).toEqual(step.expect.base_urls);
            expect(held!.delivery!.baseUrls.length - kept.length).toBe(step.expect.warnings);
          }
        }
      });
    }
  });
}

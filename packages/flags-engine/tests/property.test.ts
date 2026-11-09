// Property tests: buckets stay in [0, 99] and are deterministic; evaluation never throws on user data
// and returns the same details for the same input.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bucket, evaluate, evaluateAll, parseConfig } from "../src/index.js";

const rand = (n: number): string => randomBytes(n).toString("base64");

describe("bucket", () => {
  it("is an integer in [0, 99] and deterministic", () => {
    for (let i = 0; i < 5000; i++) {
      const seed = rand(i % 9);
      const v = rand(1 + (i % 17));
      const b = bucket(seed, v);
      expect(Number.isInteger(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(99);
      expect(bucket(seed, v)).toBe(b);
    }
  });
  it("is roughly uniform (each bucket 50-150 of 10,000)", () => {
    const counts = new Array(100).fill(0);
    for (let i = 0; i < 10000; i++) counts[bucket("uniform", `user-${i}`)]++;
    for (const c of counts) expect(c).toBeGreaterThan(50), expect(c).toBeLessThan(150);
  });
});

const config = parseConfig({
  schema: 1,
  revision: 3,
  generation: 1,
  salt: "s",
  segments: { seg: { conditions: [{ user: { attribute: "email", comparator: "ends_with_any", values: ["@a.com"] } }] } },
  settings: {
    f: {
      type: "string",
      value: "d",
      rules: [
        { conditions: [{ segment: { segment: "seg", comparator: "not_in" } }, { user: { attribute: "v", comparator: "semver_gte", values: ["1.0.0"] } }], serve: "r0" },
        { conditions: [{ user: { attribute: "n", comparator: "num_lt", values: [5] } }, { user: { attribute: "d", comparator: "after", values: [0] } }], percentages: [{ percentage: 30, value: "a" }, { percentage: 70, value: "b" }] },
        { conditions: [{ user: { attribute: "tags", comparator: "array_contains_any", values: ["x"] } }, { prerequisite: { setting: "g", comparator: "eq", value: true } }], serve: "r2" },
        { conditions: [{ user: { attribute: "email", comparator: "starts_with_any_hashed", values: ["1_" + "0".repeat(64)] } }], serve: "r3" },
      ],
      percentages: [{ percentage: 50, value: "p0" }, { percentage: 50, value: "p1" }],
    },
    g: { type: "boolean", value: true },
  },
});

const pick = <T>(xs: T[]): T => xs[randomBytes(1)[0]! % xs.length]!;
const values = (): unknown =>
  pick<unknown>([undefined, null, "", rand(3), 4, -1.5, Number.NaN, Infinity, true, new Date(0), new Date(Number.NaN), ["x"], [1], "[\"x\"]", "1.2.3", " 2.0.0-rc.1 ", "v1", { a: 1 }, Symbol("s"), () => 1, 10n]);

describe("evaluate on arbitrary user data", () => {
  it("never throws, always returns a value of the setting's type, and is deterministic", () => {
    for (let i = 0; i < 3000; i++) {
      const user: Record<string, unknown> = {};
      for (const k of ["identifier", "email", "v", "n", "d", "tags"]) if (randomBytes(1)[0]! & 1) user[k] = values();
      if (randomBytes(1)[0]! & 1) user.custom = pick([null, 3, "x", { n: values(), tags: values() }]);
      const a = evaluate(config, "f", "fallback", user);
      expect(typeof a.value).toBe("string");
      expect(a.reason).not.toBe("ERROR");
      expect(evaluate(config, "f", "fallback", user)).toEqual(a);
      expect(evaluateAll(config, user).map((d) => d.value)).toEqual([a.value, true]);
    }
  });
});

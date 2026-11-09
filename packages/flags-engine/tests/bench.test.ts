// Performance (review S7): a config holding 20,000 comparison values (the API's cap per rendered
// config) evaluates with evaluateAll in under 50 ms; list comparators are compiled to Sets.
import { describe, expect, it } from "vitest";
import { evaluateAll, hashConfidential, parseConfig } from "../src/index.js";

function bigConfig(): object {
  const settings: Record<string, unknown> = {};
  for (let s = 0; s < 20; s++) {
    const key = `flag_${s}`;
    const list = Array.from({ length: 1000 }, (_, i) => `user-${s}-${i}@example.com`);
    const comparator = s % 4 === 0 ? "one_of_hashed" : s % 4 === 1 ? "contains_any" : s % 4 === 2 ? "not_one_of" : "one_of";
    const values = comparator === "one_of_hashed" ? list.map((v) => hashConfidential(v, "salt", key)) : list;
    settings[key] = {
      type: "boolean",
      value: false,
      rules: [{ conditions: [{ user: { attribute: "email", comparator, values } }], serve: true }],
      percentages: [{ percentage: 50, value: true }, { percentage: 50, value: false }],
    };
  }
  return { schema: 1, revision: 1, generation: 1, salt: "salt", settings };
}

describe("benchmark", () => {
  it("evaluateAll over 20,000 comparison values runs in < 50 ms", () => {
    const config = parseConfig(JSON.stringify(bigConfig()));
    const user = { identifier: "u-1", email: "nobody@example.org" };
    for (let i = 0; i < 5; i++) evaluateAll(config, user); // warm up
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t = performance.now();
      const all = evaluateAll(config, user);
      times.push(performance.now() - t);
      expect(all).toHaveLength(20);
    }
    times.sort((a, b) => a - b);
    const median = times[7]!;
    console.log(`evaluateAll, 20 settings x 1,000 values: median ${median.toFixed(2)} ms, max ${times[14]!.toFixed(2)} ms`);
    expect(median).toBeLessThan(50);
  });
  it("parseConfig of the same config runs in < 100 ms", () => {
    const text = JSON.stringify(bigConfig());
    const t = performance.now();
    parseConfig(text);
    expect(performance.now() - t).toBeLessThan(100);
  });
});

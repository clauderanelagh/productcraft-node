// The engine's shared vectors (design 7.6) through FlagsClient: every suite in bootstrap mode, and the
// client[] delivery transcripts against core's node:http mock server.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FlagsClient, type FlagsClientError } from "../src/index.js";
import { startMockServer, type MockServer } from "../../core/tests/mock-server.js";
import { recordingLogger, sdkKey } from "./helpers.js";

const DIR = join(dirname(createRequire(import.meta.url).resolve("@productcraft/flags-engine/package.json")), "vectors");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vector JSON is untyped test data
const load = (p: string): any => JSON.parse(readFileSync(join(DIR, p), "utf8"));

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

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
it("finds the engine's vector files", () => expect(files.length).toBeGreaterThanOrEqual(6));

for (const file of files) {
  const doc = load(file);
  for (const suite of doc.suites ?? []) {
    describe(`${file}: ${suite.name} (bootstrap)`, () => {
      const raw = suite.config ?? load(suite.config_ref);
      const flags = new FlagsClient({ sdkKey: sdkKey(), bootstrap: raw, polling: { mode: "manual" }, logger: null });
      const snap = flags.snapshot();
      for (const c of suite.cases) {
        // An object default on a json setting is TYPE_MISMATCH in the engine; the client parses instead (design 8.2, tested below).
        const objectOnJson = c.default !== null && typeof c.default === "object" && raw.settings?.[c.key]?.type === "json";
        it.skipIf(objectOnJson)(c.name, async () => {
          const user = c.user === null ? null : (decode(c.user) as Record<string, unknown>);
          const def = decode(c.default) as never;
          for (const d of [snap.getValueDetails(c.key, def, user), await flags.getValueDetails(c.key, def, user)]) {
            const e = c.expect;
            // A null default parses a json setting (design 8.2); the engine vectors hold its text.
            const jsonNull = def === null && snap.keys().includes(c.key) && typeof e.value === "string" && raw.settings[c.key]?.type === "json";
            const got: Record<string, unknown> = {
              value: jsonNull ? JSON.stringify(d.value) : d.value,
              // Served from bootstrap before any download: the client layer marks it CACHED.
              reason: d.reason === "CACHED" ? "(served)" : d.reason,
              rule_index: d.ruleIndex,
              percentage_index: d.percentageIndex,
              error_code: d.errorCode,
              is_default_value: d.isDefaultValue,
              variant: d.variant,
              warnings: d.warnings.map((w) => w.code),
            };
            for (const k of Object.keys(e)) {
              let want = decode(e[k]);
              if (k === "reason" && want !== "ERROR") want = "(served)";
              if (k === "value" && jsonNull) want = JSON.stringify(JSON.parse(want as string));
              expect(got[k], `${k} of ${c.key}`).toEqual(want);
            }
          }
        });
      }
    });
  }
}

it("an object default on a json setting returns the parsed value (the engine alone says TYPE_MISMATCH)", async () => {
  const flags = new FlagsClient({ sdkKey: sdkKey(), polling: { mode: "manual" }, logger: null, bootstrap: { schema: 1, revision: 1, generation: 1, salt: "", settings: { j: { type: "json", value: "[1]" } } } });
  expect(await flags.getValue("j", {})).toEqual([1]);
});

describe("client[] transcripts against the mock server", () => {
  let server: MockServer;
  beforeAll(async () => (server = await startMockServer()));
  afterAll(() => server.close());

  for (const t of load("client.json").client) {
    it(t.name, async () => {
      server.reply(
        ...t.steps.map((s: { response: { status: number; headers?: Record<string, string>; body?: unknown; body_size?: number } }) => ({
          status: s.response.status,
          headers: s.response.headers,
          body: s.response.body_size ? "x".repeat(s.response.body_size) : s.response.body,
        })),
      );
      const hosts: string[] = [];
      const { lines, logger } = recordingLogger();
      const flags = new FlagsClient({
        sdkKey: sdkKey(1),
        polling: { mode: "manual" },
        logger,
        // No baseUrl, so delivery.base_urls hints apply; every host is routed to the mock server.
        fetch: (input, init) => {
          const u = new URL(String(input));
          hosts.push(u.host);
          return fetch(`${server.url}${u.pathname}`, init);
        },
      });
      const errors: FlagsClientError[] = [];
      let changes = 0;
      flags.on("error", (e) => errors.push(e as FlagsClientError));
      flags.on("configChanged", () => changes++);
      for (const [i, step] of t.steps.entries()) {
        errors.length = 0;
        const before = changes;
        await flags.forceRefresh();
        const req = server.requests[i]!;
        expect(req.headers["if-none-match"] ?? null, `step ${i} If-None-Match`).toBe(step.request.if_none_match);
        expect(req.path).toMatch(/^\/v1\/configs\/pcf_sdk_[0-9A-Za-z]{38}\/config\.json$/);
        const snap = flags.snapshot();
        expect({ revision: snap.revision, generation: snap.generation }).toEqual(step.expect.held);
        expect(changes > before, `step ${i} accepted`).toBe(step.expect.accepted);
        if (step.expect.state) expect(flags.state).toBe(step.expect.state);
        if (step.expect.error) expect(errors.map((e) => e.code)).toContain(step.expect.error);
        if (step.expect.base_urls) {
          expect(lines.filter((l) => l.includes("base_urls")).length).toBe(step.expect.warnings);
          await flags.forceRefresh();
          expect(hosts.at(-1)).toBe(new URL(step.expect.base_urls[0]).host);
        }
        if (step.expect.next_poll_at_least_s) expect(errors.map((e) => e.code)).toContain("rate_limited");
      }
      flags.close();
    });
  }
});

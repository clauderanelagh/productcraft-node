// Auth 1.x keeps every public name of the two published 0.x lines (docs/sdk-standard.md
// section 7). tests/compat/auth-<version>.json was recorded from the published package
// (npm install @productcraft/auth@<version>; every method called against a recording
// fetch): its exports and, per scope, each name with the route it called. Here every
// one of those names must exist on 1.x and call the same method and path, and
// compat.json must map each to the operation behind that route.
import { describe, expect, it } from "vitest";
import * as sdk from "../src/index.js";
import { APIError, Auth, AuthHttpError, NotFoundError } from "../src/index.js";
import compat from "../compat.json" with { type: "json" };
import spec from "../../../Specs/auth.json" with { type: "json" };
import v060 from "./compat/auth-0.6.0.json" with { type: "json" };
import v080 from "./compat/auth-0.8.0.json" with { type: "json" };

type Entry = { kind: "call"; arity: number; method: string; path: string } | { kind: "function" | "property" | "scope"; arity?: number };
type Snapshot = { version: string; exports: string[]; root: Record<string, Entry>; app: Record<string, Entry>; consumer: Record<string, Entry> };
const SNAPSHOTS = [v060, v080] as unknown as Snapshot[];
const SCOPES = ["root", "app", "consumer"] as const;

/** The recorder's argument shape: stringifies to `A<i>`, and carries the 0.x signinWithProvider fields. */
const argFor = (i: number) => Object.assign(Object.create({ toString: () => `A${i}` }), { provider: "google", id_token: "t", nonce: "n" });

function recorder() {
  let last: { method: string; path: string } | null = null;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    last = { method: req.method, path: new URL(req.url).pathname };
    const body = req.method === "GET" ? { data: [], pagination: { next_cursor: null, has_more: false } } : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, take: () => ((l) => ((last = null), l))(last) };
}

/** Same normalisation as the recorder: bound ids and positional args back to placeholders. */
const normalise = (path: string) =>
  path.replace("/APPID/", "/{app_id}/").replace(/\/APPID$/, "/{app_id}").replace(/^\/SLUG\//, "/{app_slug}/").replace(/A(\d)/g, "{$1}");

function resolve(root: unknown, name: string): { owner: unknown; value: unknown } {
  let owner: unknown = root;
  const segs = name.split(".");
  for (const s of segs.slice(0, -1)) owner = (owner as Record<string, unknown>)[s];
  return { owner, value: (owner as Record<string, unknown>)[segs[segs.length - 1]!] };
}

function specRoute(operationId: string): { method: string; path: string } {
  for (const [path, item] of Object.entries(spec.paths as Record<string, Record<string, { operationId?: string }>>)) {
    for (const [method, op] of Object.entries(item)) if (op.operationId === operationId) return { method: method.toUpperCase(), path };
  }
  throw new Error(`no operation ${operationId}`);
}
const matches = (template: string, path: string) =>
  new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path.replace(/\{(\d)\}/g, "X$1"));

for (const snap of SNAPSHOTS) {
  describe(`@productcraft/auth ${snap.version} names on 1.x`, () => {
    it("every export still exists", () => {
      for (const name of snap.exports) expect(sdk, name).toHaveProperty(name);
    });

    for (const scope of SCOPES) {
      for (const [name, entry] of Object.entries(snap[scope])) {
        it(`${scope === "root" ? "auth" : `auth.${scope}(…)`}.${name}`, async () => {
          const rec = recorder();
          const auth = new Auth({ auth: { type: "apiKey", key: "pcft_test" }, fetch: rec.fetch, baseUrl: "https://api.test", maxRetries: 0 });
          const root = scope === "root" ? auth : scope === "app" ? auth.app("APPID") : auth.consumer("SLUG");
          const { owner, value } = resolve(root, name);
          const mapped = (compat.methods as Record<string, Record<string, { operationId?: string; handwritten?: string }>>)[scope]![name];
          expect(mapped, `compat.json has no entry for ${scope}:${name}`).toBeDefined();
          if (entry.kind === "property") return expect(value).toBeDefined();
          expect(typeof value).toBe("function");
          if (entry.kind !== "call") return;
          const args = Array.from({ length: entry.arity }, (_, i) => argFor(i));
          await Promise.resolve((value as (...a: unknown[]) => unknown).apply(owner, args)).catch(() => undefined);
          const got = rec.take();
          expect(got && { method: got.method, path: normalise(got.path) }).toEqual({ method: entry.method, path: entry.path });
          const route = specRoute(mapped!.operationId!);
          expect(route.method).toBe(entry.method);
          expect(matches(route.path, entry.path), `${mapped!.operationId} is ${route.path}`).toBe(true);
        });
      }
    }
  });
}

describe("0.x error class names", () => {
  it("AuthHttpError is APIError: instanceof holds for every API error", async () => {
    expect(AuthHttpError).toBe(APIError);
    const fetch = async () => Response.json({ statusCode: 404, code: "NOT_FOUND", message: "App not found" }, { status: 404, headers: { "x-request-id": "req_1" } });
    const auth = new Auth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    const err = await auth.apps.retrieve("00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AuthHttpError);
    expect((err as APIError).requestId).toBe("req_1");
  });

  it("the deprecated aliases are tagged in the generated source", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/_generated/resources.ts", import.meta.url), "utf8");
    expect(src).toMatch(/0\.x name for `auth\.consumer\(…\)\.signin\(\)`[\s\S]*?@deprecated Use `auth\.consumer\(…\)\.signin\(\)`/);
    expect(src).toMatch(/@deprecated Use `auth\.consumer\(…\)\.me\.retrieve\(\)`/);
  });
});

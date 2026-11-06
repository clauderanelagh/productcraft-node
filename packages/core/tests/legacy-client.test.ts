import { describe, expect, it } from "vitest";
import { makeClient } from "../src/index.js";

type Paths = { "/v1/ping": { get: { responses: { 200: { content: { "application/json": { ok: boolean } } } } } } };

function capture() {
  const seen: Request[] = [];
  const fetchImpl = async (input: Request | string | URL, init?: RequestInit) => {
    seen.push(input instanceof Request ? input : new Request(input, init));
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  };
  return { seen, fetch: fetchImpl as typeof fetch };
}

describe("makeClient (the .client escape hatch)", () => {
  it("identifies itself as the SDK in User-Agent", async () => {
    const { seen, fetch } = capture();
    const client = makeClient<Paths>("https://api.example.test", { auth: { type: "apiKey", key: "pcft_test" }, fetch });
    await client.GET("/v1/ping");
    expect(seen[0].headers.get("user-agent")).toMatch(/^productcraft-node\/core@\S+ node\/\d+/);
    expect(seen[0].headers.get("authorization")).toBe("Bearer pcft_test");
  });

  it("keeps a User-Agent the caller set", async () => {
    const { seen, fetch } = capture();
    const client = makeClient<Paths>("https://api.example.test", { auth: { type: "apiKey", key: "pcft_test" }, fetch });
    await client.GET("/v1/ping", { headers: { "User-Agent": "my-app/1.0" } });
    expect(seen[0].headers.get("user-agent")).toBe("my-app/1.0");
  });
});

// Runtime behaviour of the generated PlatformAuth client over the generated mock
// fetch: slug-positional workspace routes, public auth routes, form uploads,
// auto-pagination, errors with request ids and the `.client` escape hatch.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, PlatformAuth } from "../src/index.js";
import { createMockFetch } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const KEY_ID = "3f0c2a1b-7d4e-4c5f-8a9b-0c1d2e3f4a5b";
const IDEMPOTENCY_KEY = /^pc_[0-9a-f-]{36}$/;

describe("@productcraft/platform-auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("takes the workspace slug positionally and never resolves a workspace id for slug routes", async () => {
    const fetch = createMockFetch();
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    await platform.workspaces.retrieve("acme");
    await platform.workspaces.apiKeys.retrieve("acme", KEY_ID);
    await platform.workspaces.apiKeys.delete("acme", KEY_ID, { force: true });
    expect(fetch.calls.map((c) => [c.method, c.url.pathname + c.url.search])).toEqual([
      ["GET", "/v1/workspaces/acme"],
      ["GET", `/v1/workspaces/acme/api-keys/${KEY_ID}`],
      ["DELETE", `/v1/workspaces/acme/api-keys/${KEY_ID}?force=true`],
    ]);
    for (const c of fetch.calls) expect(c.headers.get("authorization")).toBe("Bearer pcft_test");
  });

  it("apiKeys.self describes the calling key", async () => {
    const fetch = createMockFetch({ "apiKeys.self": { key_id: KEY_ID, name: "sdk-smoke", workspace_id: WORKSPACE_ID, workspace: { id: WORKSPACE_ID, slug: "acme" }, actions: [], allowed: [] } });
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    const me = await platform.apiKeys.self();
    expect(me.workspace_id).toBe(WORKSPACE_ID);
    expect(me.lastResponse.requestId).toBe("req_mock_1");
    expect(fetch.calls[0]!.url.pathname).toBe("/v1/api-keys/self");
  });

  it("stats.retrieve binds workspace_id, resolved once from /v1/api-keys/self for a workspace key", async () => {
    vi.stubEnv("PRODUCTCRAFT_WORKSPACE_ID", "");
    const fetch = createMockFetch({ "apiKeys.self": { key_id: KEY_ID, workspace_id: WORKSPACE_ID, workspace: { id: WORKSPACE_ID, slug: "acme" } } });
    const platform = new PlatformAuth({ apiKey: "pcft_test_stats", fetch, maxRetries: 0 });
    await platform.stats.retrieve();
    await platform.stats.retrieve();
    expect(fetch.calls.map((c) => c.url.pathname)).toEqual(["/v1/api-keys/self", `/v1/workspaces/${WORKSPACE_ID}/stats`, `/v1/workspaces/${WORKSPACE_ID}/stats`]);
  });

  it("creating a key sends an Idempotency-Key, overridable per request", async () => {
    const fetch = createMockFetch();
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    await platform.workspaces.apiKeys.create("acme", { name: "sdk-smoke", preset: "readonly" });
    await platform.workspaces.apiKeys.create("acme", { name: "sdk-smoke", preset: "readonly" }, { idempotencyKey: "mine" });
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(IDEMPOTENCY_KEY);
    expect(fetch.calls[0]!.body).toEqual({ name: "sdk-smoke", preset: "readonly" });
    expect(fetch.calls[1]!.headers.get("idempotency-key")).toBe("mine");
  });

  it("auth.signin is public: no Authorization header even on a keyed client", async () => {
    const fetch = createMockFetch();
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    await platform.auth.signin({ identifier: "ada@example.com", password: "pw", session_duration: 3600 });
    expect(fetch.calls[0]!.url.pathname).toBe("/v1/auth/signin");
    expect(fetch.calls[0]!.headers.get("authorization")).toBeNull();
    expect(fetch.calls[0]!.body).toEqual({ identifier: "ada@example.com", password: "pw", session_duration: 3600 });
  });

  it("uploads an avatar as multipart FormData with the file, not JSON", async () => {
    const fetch = createMockFetch();
    const platform = new PlatformAuth({ auth: { type: "bearer", token: "session" }, fetch, maxRetries: 0 });
    const file = new File([new Uint8Array([137, 80, 78, 71])], "logo.png", { type: "image/png" });
    await platform.workspaces.avatar.upload("acme", { file });
    const call = fetch.calls[0]!;
    expect(call.url.pathname).toBe("/v1/workspaces/acme/avatar");
    expect(call.headers.get("content-type")).toBeNull();
    expect(call.body).toBeInstanceOf(FormData);
    const sent = (call.body as FormData).get("file") as File;
    expect(sent.name).toBe("logo.png");
    expect(sent.type).toBe("image/png");
  });

  it("auto-paginates workspaces.apiKeys.list over next_cursor", async () => {
    const fetch = createMockFetch({
      "workspaces.apiKeys.list": (call: { url: URL }) =>
        call.url.searchParams.get("cursor") === null
          ? { data: [{ id: "k1", name: "a" }], pagination: { next_cursor: "c2", has_more: true } }
          : { data: [{ id: "k2", name: "b" }], pagination: { next_cursor: null, has_more: false } },
    });
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    const ids: string[] = [];
    for await (const k of platform.workspaces.apiKeys.list("acme", { limit: 1 })) ids.push(k.id);
    expect(ids).toEqual(["k1", "k2"]);
    expect(fetch.calls[0]!.url.searchParams.get("limit")).toBe("1");
    expect(fetch.calls[1]!.url.searchParams.get("cursor")).toBe("c2");
  });

  it("throws NotFoundError with the request id and doc url", async () => {
    const fetch = createMockFetch({
      "workspaces.apiKeys.retrieve": () =>
        new Response(JSON.stringify({ status_code: 404, code: "NOT_FOUND", message: "API key not found" }), {
          status: 404,
          headers: { "content-type": "application/json", "x-request-id": "req_header" },
        }),
    });
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    const err = await platform.workspaces.apiKeys.retrieve("acme", "00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).requestId).toBe("req_header");
    expect((err as NotFoundError).docUrl).toBe("https://productcraft.co/docs/errors#NOT_FOUND");
  });

  it("keeps .client typed by the same paths", async () => {
    const fetch = createMockFetch();
    const platform = new PlatformAuth({ apiKey: "pcft_test", fetch, maxRetries: 0 });
    const { data } = await platform.client.POST("/v1/introspect/api-key");
    expect(data).toBeDefined();
    expect(fetch.calls[0]!.headers.get("authorization")).toBe("Bearer pcft_test");
  });
});

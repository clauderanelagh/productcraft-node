/**
 * Smoke tests: each scope's resource methods produce the right
 * HTTP method + URL + body. We don't hit the network — we stub
 * `fetch` and assert on what the SDK tries to send.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Heimdall } from "../src/index.js";

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeFakeFetch(): { fetch: typeof fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const method =
        (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const headers: Record<string, string> = {};
      new Headers(init?.headers as Record<string, string> | undefined).forEach(
        (v, k) => (headers[k] = v),
      );
      const bodyText =
        typeof init?.body === "string" ? init.body : undefined;
      const body = bodyText ? JSON.parse(bodyText) : undefined;
      calls.push({ url, method, headers, body });

      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  ) as unknown as typeof fetch;
  return { fetch, calls };
}

describe("Heimdall — workspace-level admin", () => {
  let heimdall: Heimdall;
  let calls: CapturedRequest[];

  beforeEach(() => {
    const ff = makeFakeFetch();
    calls = ff.calls;
    heimdall = new Heimdall({
      auth: { type: "apiKey", key: "pcft_live_test" },
      baseUrl: "https://api.heimdall.example",
      fetch: ff.fetch,
    });
  });

  it("apps.list sends GET /v1/apps with Authorization header", async () => {
    await heimdall.apps.list();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe("https://api.heimdall.example/v1/apps");
    expect(calls[0]!.headers.authorization).toBe("Bearer pcft_live_test");
  });

  it("apps.create sends POST with the body JSON-encoded", async () => {
    await heimdall.apps.create({ name: "demo", slug: "demo" } as never);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.heimdall.example/v1/apps");
    expect(calls[0]!.body).toEqual({ name: "demo", slug: "demo" });
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
  });

  it("idp.list sends GET /v1/idp/providers", async () => {
    await heimdall.idp.list();
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/v1/idp/providers",
    );
  });

  it("stats.get sends GET /v1/stats/me", async () => {
    await heimdall.stats.get();
    expect(calls[0]!.url).toBe("https://api.heimdall.example/v1/stats/me");
  });
});

describe("AppScope — appId pre-bound", () => {
  let app: ReturnType<Heimdall["app"]>;
  let calls: CapturedRequest[];

  beforeEach(() => {
    const ff = makeFakeFetch();
    calls = ff.calls;
    const heimdall = new Heimdall({
      auth: { type: "apiKey", key: "k" },
      baseUrl: "https://api.heimdall.example",
      fetch: ff.fetch,
    });
    app = heimdall.app("app_abc123");
  });

  it("endUsers.list interpolates appId into the URL", async () => {
    await app.endUsers.list();
    expect(calls[0]!.url).toContain("/v1/apps/app_abc123/end-users");
  });

  it("endUsers.update sends PATCH with userId in path + body", async () => {
    await app.endUsers.update("user_xyz", { displayName: "Alice" } as never);
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/v1/apps/app_abc123/end-users/user_xyz",
    );
    expect(calls[0]!.body).toEqual({ displayName: "Alice" });
  });

  it("endUsers.revokeAllSessions (callDirect workaround) hits the right path", async () => {
    await app.endUsers.revokeAllSessions("user_xyz");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/v1/apps/app_abc123/end-users/user_xyz/sessions/revoke-all",
    );
  });

  it("roles.get (callDirect workaround) hits the right path", async () => {
    await app.roles.get("admin");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/v1/apps/app_abc123/roles/admin",
    );
  });

  it("invites.create scopes by appId", async () => {
    await app.invites.create({
      email: "x@example.com",
      role: "admin",
    } as never);
    expect(calls[0]!.url).toContain("/v1/apps/app_abc123/invites");
  });
});

describe("ConsumerScope — appSlug pre-bound", () => {
  let consumer: ReturnType<Heimdall["consumer"]>;
  let calls: CapturedRequest[];

  beforeEach(() => {
    const ff = makeFakeFetch();
    calls = ff.calls;
    const heimdall = new Heimdall({
      baseUrl: "https://api.heimdall.example",
      fetch: ff.fetch,
    });
    consumer = heimdall.consumer("my-app");
  });

  it("auth.signin POSTs to /{slug}/v1/auth/signin", async () => {
    await consumer.auth.signin({ identifier: "alice", password: "pw" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/my-app/v1/auth/signin",
    );
    expect(calls[0]!.body).toEqual({ identifier: "alice", password: "pw" });
  });

  it("auth.signup (callDirect) hits the right path", async () => {
    await consumer.auth.signup({
      identifier: "bob",
      password: "pw2",
    } as never);
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/my-app/v1/auth/signup",
    );
  });

  it("me.getProfile (callDirect workaround) hits /{slug}/v1/me", async () => {
    await consumer.me.getProfile();
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/my-app/v1/me",
    );
  });

  it("me.revokeSession (callDirect) hits the right path", async () => {
    await consumer.me.revokeSession("sess_123");
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/my-app/v1/me/sessions/sess_123",
    );
  });

  it("verify.verify scopes by appSlug", async () => {
    await consumer.verify.verify({ token: "jwt-here" } as never);
    expect(calls[0]!.url).toBe(
      "https://api.heimdall.example/my-app/v1/verify",
    );
  });

  it("expectedIssuer derives from baseUrl + appSlug", () => {
    expect(consumer.expectedIssuer).toBe(
      "https://api.heimdall.example/my-app",
    );
  });
});

/**
 * Env credential fallback (tasks/sdk/001): admin routes fall back to
 * PRODUCTCRAFT_API_KEY, consumer routes never read a credential from
 * the environment, and consumer() defaults its slug from
 * PRODUCTCRAFT_AUTH_APP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Auth } from "../src/index.js";

interface Captured {
  url: string;
  headers: Record<string, string>;
}

function fakeFetch(): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const headers: Record<string, string> = {};
    new Headers(
      (init?.headers as Record<string, string> | undefined) ??
        (input instanceof Request ? input.headers : undefined),
    ).forEach((v, k) => (headers[k] = v));
    calls.push({ url, headers });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch, calls };
}

const BASE = "https://api.auth.example";

describe("Auth env fallback", () => {
  beforeEach(() => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
    vi.stubEnv("PRODUCTCRAFT_AUTH_APP", "env-app");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("workspace admin routes pick up PRODUCTCRAFT_API_KEY", async () => {
    const ff = fakeFetch();
    await new Auth({ baseUrl: BASE, fetch: ff.fetch }).apps.list();
    expect(ff.calls[0]!.headers.authorization).toBe("Bearer pcft_live_env");
  });

  it("app(appId) picks up PRODUCTCRAFT_API_KEY", async () => {
    const ff = fakeFetch();
    await new Auth({ baseUrl: BASE, fetch: ff.fetch }).app("app_1").endUsers.list();
    expect(ff.calls[0]!.url).toContain("/v1/apps/app_1/");
    expect(ff.calls[0]!.headers.authorization).toBe("Bearer pcft_live_env");
  });

  it("explicit auth wins over the environment", async () => {
    const ff = fakeFetch();
    await new Auth({
      baseUrl: BASE,
      fetch: ff.fetch,
      auth: { type: "apiKey", key: "pcft_live_explicit" },
    }).apps.list();
    expect(ff.calls[0]!.headers.authorization).toBe("Bearer pcft_live_explicit");
  });

  it("consumer(slug) sends NO Authorization header even with the env key set", async () => {
    const ff = fakeFetch();
    await new Auth({ baseUrl: BASE, fetch: ff.fetch })
      .consumer("my-app")
      .auth.signin({ identifier: "alice", password: "pw" });
    expect(ff.calls[0]!.url).toBe(`${BASE}/my-app/v1/auth/signin`);
    expect(ff.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("explicit auth still reaches consumer routes (signup_requires_pak)", async () => {
    const ff = fakeFetch();
    await new Auth({
      baseUrl: BASE,
      fetch: ff.fetch,
      auth: { type: "apiKey", key: "pak_explicit" },
    })
      .consumer("my-app")
      .auth.signup({ identifier: "bob", password: "pw" } as never);
    expect(ff.calls[0]!.url).toBe(`${BASE}/my-app/v1/auth/signup`);
    expect(ff.calls[0]!.headers.authorization).toBe("Bearer pak_explicit");
  });

  it("consumer() defaults the slug from PRODUCTCRAFT_AUTH_APP", async () => {
    const ff = fakeFetch();
    const scope = new Auth({ baseUrl: BASE, fetch: ff.fetch }).consumer();
    expect(scope.appSlug).toBe("env-app");
    await scope.auth.signin({ identifier: "a", password: "b" });
    expect(ff.calls[0]!.url).toBe(`${BASE}/env-app/v1/auth/signin`);
    expect(ff.calls[0]!.headers.authorization).toBeUndefined();
  });

  it("an explicit slug wins over PRODUCTCRAFT_AUTH_APP", () => {
    expect(new Auth().consumer("given").appSlug).toBe("given");
  });

  it("consumer() without a slug or env var throws a clear error", () => {
    vi.stubEnv("PRODUCTCRAFT_AUTH_APP", "");
    expect(() => new Auth().consumer()).toThrow(/PRODUCTCRAFT_AUTH_APP/);
  });

  it("without a process global (browser) there is no fallback and no crash", async () => {
    const ff = fakeFetch();
    const g = globalThis as { process?: unknown };
    const saved = g.process;
    let auth: Auth;
    let consumerError: unknown;
    // Synchronous swap: vitest itself needs `process` once we yield.
    g.process = undefined;
    try {
      auth = new Auth({ baseUrl: BASE, fetch: ff.fetch });
      try {
        auth.consumer();
      } catch (e) {
        consumerError = e;
      }
    } finally {
      g.process = saved;
    }
    await auth.apps.list();
    expect(ff.calls[0]!.headers.authorization).toBeUndefined();
    expect(String(consumerError)).toMatch(/app slug/);
  });
});

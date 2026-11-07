/**
 * Task 010: apiKey shorthand, shared config fan-out, one workspace id, lazy products.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetWorkspaceCache } from "@productcraft/core";
import { ConfigurationError, NotFoundError, ProductCraft, type Mail } from "../src/index.js";

const WS = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const page = { data: [], pagination: { next_cursor: null, has_more: false } };

function recorder(respond: (req: Request) => Response = () => Response.json(page)) {
  const seen: Request[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push(req);
    return respond(req);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

beforeEach(() => {
  _resetWorkspaceCache();
  vi.stubEnv("PRODUCTCRAFT_API_KEY", "");
  vi.stubEnv("PRODUCTCRAFT_WORKSPACE_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("credentials", () => {
  it("apiKey is a shorthand for auth: { type: 'apiKey' }", async () => {
    const r = recorder();
    const pc = new ProductCraft({ apiKey: "pcft_live_short", workspaceId: WS, fetch: r.fetch });
    await pc.trawl.jobs.list();
    await pc.waitlist.lists.list();
    expect(r.seen.map((q) => q.headers.get("authorization"))).toEqual(["Bearer pcft_live_short", "Bearer pcft_live_short"]);
  });

  it("an explicit auth credential wins over apiKey and works for bearer tokens", async () => {
    const r = recorder();
    const pc = new ProductCraft({ apiKey: "pcft_live_short", auth: { type: "bearer", token: "jwt" }, workspaceId: WS, fetch: r.fetch });
    await pc.social.communities.list();
    expect(r.seen[0]!.headers.get("authorization")).toBe("Bearer jwt");
  });

  it("falls back to PRODUCTCRAFT_API_KEY, but never on Auth consumer routes", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
    const r = recorder(() => Response.json({ access_token: "a" }));
    const pc = new ProductCraft({ workspaceId: WS, fetch: r.fetch });
    await pc.mail.domains.list();
    await pc.auth.consumer("demo").signin({ identifier: "ada@example.com", password: "x" });
    expect(r.seen[0]!.headers.get("authorization")).toBe("Bearer pcft_live_env");
    expect(r.seen[1]!.headers.get("authorization")).toBeNull();
  });
});

describe("shared config", () => {
  it("fans out workspaceId, headers, maxRetries and fetch to every product", async () => {
    const r = recorder(() => Response.json({ code: "NOT_FOUND", message: "nope" }, { status: 404 }));
    const pc = new ProductCraft({ apiKey: "k", workspaceId: WS, fetch: r.fetch, maxRetries: 0, defaultHeaders: { "x-trace": "t1" } });
    await expect(pc.trawl.jobs.list()).rejects.toBeInstanceOf(NotFoundError);
    await expect(pc.mail.domains.list()).rejects.toBeInstanceOf(NotFoundError);
    expect(r.seen).toHaveLength(2);
    for (const q of r.seen) {
      expect(q.url).toContain(`/v1/workspaces/${WS}/`);
      expect(q.headers.get("x-trace")).toBe("t1");
    }
  });

  it("retries per the shared maxRetries", async () => {
    const r = recorder(() => new Response("{}", { status: 503, headers: { "retry-after-ms": "1" } }));
    const pc = new ProductCraft({ apiKey: "k", workspaceId: WS, fetch: r.fetch, maxRetries: 1 });
    await expect(pc.trawl.jobs.list()).rejects.toThrow();
    expect(r.seen).toHaveLength(2);
  });

  it("an override replaces only the fields it sets", async () => {
    const r = recorder();
    const pc = new ProductCraft({
      apiKey: "k",
      workspaceId: WS,
      fetch: r.fetch,
      overrides: { mail: { baseUrl: "https://mail.example.test" }, platformAuth: { baseUrl: "https://old.example.test" }, platform: { timeout: 5 } },
    });
    await pc.mail.domains.list();
    await pc.trawl.jobs.list();
    await pc.platform.stats.retrieve();
    expect(new URL(r.seen[0]!.url).host).toBe("mail.example.test");
    expect(r.seen[0]!.headers.get("authorization")).toBe("Bearer k");
    expect(new URL(r.seen[1]!.url).host).not.toBe("mail.example.test");
    expect(new URL(r.seen[2]!.url).host).toBe("old.example.test");
  });

  it("reads PRODUCTCRAFT_WORKSPACE_ID once, at construction", async () => {
    vi.stubEnv("PRODUCTCRAFT_WORKSPACE_ID", WS);
    const r = recorder();
    const pc = new ProductCraft({ apiKey: "k", fetch: r.fetch });
    vi.stubEnv("PRODUCTCRAFT_WORKSPACE_ID", "changed-later");
    await pc.trawl.jobs.list();
    await pc.mail.domains.list();
    expect(r.seen.every((q) => q.url.includes(`/v1/workspaces/${WS}/`))).toBe(true);
  });

  it("without a workspaceId, every product shares one key lookup", async () => {
    const r = recorder((q) => (q.url.endsWith("/v1/api-keys/self") ? Response.json({ workspace: { id: WS } }) : Response.json(page)));
    const pc = new ProductCraft({ apiKey: "pcft_live_lookup", fetch: r.fetch });
    await Promise.all([pc.trawl.jobs.list(), pc.mail.domains.list(), pc.social.communities.list(), pc.waitlist.lists.list()]);
    const lookups = r.seen.filter((q) => q.url.endsWith("/v1/api-keys/self"));
    expect(lookups).toHaveLength(1);
    expect(r.seen.filter((q) => q.url.includes(`/v1/workspaces/${WS}/`))).toHaveLength(4);
  });
});

describe("lazy products", () => {
  it("builds a product on first access only, and reuses it", () => {
    const g = globalThis as Record<string, unknown>;
    const saved = { window: g.window, document: g.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
    g.window = { document: {} };
    Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
    try {
      // In a browser a workspace key throws when a product is built, so construction alone proves nothing was built.
      const pc = new ProductCraft({ apiKey: "pcft_live_browser" });
      expect(() => pc.mail).toThrow(ConfigurationError);
      const ok = new ProductCraft({ apiKey: "pcft_live_browser", dangerouslyAllowBrowser: true });
      const mail: Mail = ok.mail;
      expect(ok.mail).toBe(mail);
    } finally {
      g.window = saved.window;
      if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
    }
  });

  it("type namespaces come through the umbrella", () => {
    const status: Mail.DomainStatus = "active";
    expect(status).toBe("active");
  });
});

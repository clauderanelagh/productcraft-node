/**
 * Env credential fallback across every product client (tasks/sdk/001).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Mail, Waitlist, Social, Trawl, PlatformAuth, ProductCraft } from "../src/index.js";

function captureAuthHeader(): { fetch: typeof fetch; seen: (string | null)[] } {
  const seen: (string | null)[] = [];
  const fetch = vi.fn(async (input: Request) => {
    seen.push(input.headers.get("authorization"));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch, seen };
}

const clients = { Mail, Waitlist, Social, Trawl, PlatformAuth } as const;

describe("product clients env fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const [name, Ctor] of Object.entries(clients)) {
    it(`${name} picks up PRODUCTCRAFT_API_KEY when auth is omitted`, async () => {
      vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
      const ff = captureAuthHeader();
      const c = new Ctor({ baseUrl: "https://x.example", fetch: ff.fetch });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (c.client as any).GET("/anything");
      expect(ff.seen[0]).toBe("Bearer pcft_live_env");
    });

    it(`${name}: explicit auth wins over the environment`, async () => {
      vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
      const ff = captureAuthHeader();
      const c = new Ctor({
        baseUrl: "https://x.example",
        fetch: ff.fetch,
        auth: { type: "apiKey", key: "pcft_live_explicit" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (c.client as any).GET("/anything");
      expect(ff.seen[0]).toBe("Bearer pcft_live_explicit");
    });
  }

  it("no env var and no auth → no Authorization header", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "");
    const ff = captureAuthHeader();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (new Mail({ baseUrl: "https://x.example", fetch: ff.fetch }).client as any).GET("/a");
    expect(ff.seen[0]).toBeNull();
  });

  it("without a process global there is no fallback and no crash", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
    const ff = captureAuthHeader();
    const g = globalThis as { process?: unknown };
    const saved = g.process;
    let mail: Mail;
    // Synchronous swap: vitest itself needs `process` once we yield.
    g.process = undefined;
    try {
      mail = new Mail({ baseUrl: "https://x.example", fetch: ff.fetch });
    } finally {
      g.process = saved;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (mail.client as any).GET("/a");
    expect(ff.seen[0]).toBeNull();
  });

  it("new ProductCraft() with only the env var configures every surface", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_live_env");
    const ff = captureAuthHeader();
    const pc = new ProductCraft({ baseUrl: "https://x.example", fetch: ff.fetch });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (pc.trawl.client as any).GET("/a");
    expect(ff.seen[0]).toBe("Bearer pcft_live_env");
  });
});

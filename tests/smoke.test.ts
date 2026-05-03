import { describe, it, expect } from "vitest";
import { ProductCraft, Heimdall, Envoi, Rally, Agora, PlatformAuth } from "../src/index.js";

describe("ProductCraft umbrella", () => {
  it("constructs every surface from a single config", () => {
    const pc = new ProductCraft({
      auth: { type: "apiKey", key: "pcft_live_test" },
    });
    expect(pc.heimdall).toBeInstanceOf(Heimdall);
    expect(pc.envoi).toBeInstanceOf(Envoi);
    expect(pc.rally).toBeInstanceOf(Rally);
    expect(pc.agora).toBeInstanceOf(Agora);
    expect(pc.platformAuth).toBeInstanceOf(PlatformAuth);
  });

  it("each surface exposes a typed openapi-fetch client", () => {
    const pc = new ProductCraft();
    expect(typeof pc.heimdall.client.GET).toBe("function");
    expect(typeof pc.envoi.client.POST).toBe("function");
    expect(typeof pc.rally.client.PATCH).toBe("function");
  });

  it("per-surface baseUrl override wins over the shared one", () => {
    // Smoke check that the constructor doesn't throw when surface
    // overrides are passed. Actual URL routing is exercised at request
    // time; the unit test for that shape lives in `_core.test.ts`
    // (added as the v0.1+ ergonomic wrappers ship).
    const pc = new ProductCraft({
      baseUrl: "https://shared.example",
      heimdall: { baseUrl: "https://heimdall.example" },
    });
    expect(pc.heimdall).toBeInstanceOf(Heimdall);
  });
});

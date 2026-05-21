import { describe, it, expect } from "vitest";
import {
  ProductCraft,
  Heimdall,
  Envoi,
  Rally,
  Agora,
  PlatformAuth,
} from "../src/index.js";

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

  it("each surface exposes its resource namespaces", () => {
    const pc = new ProductCraft();
    // Heimdall switched to ergonomic resource methods in v0.1.0 — the
    // old `.client.GET/POST/...` surface is gone. The other surfaces
    // still expose the raw openapi-fetch client for now.
    expect(typeof pc.heimdall.app).toBe("function");
    expect(typeof pc.heimdall.consumer).toBe("function");
    expect(typeof pc.envoi.client.POST).toBe("function");
    expect(typeof pc.rally.client.PATCH).toBe("function");
  });

  it("per-surface baseUrl override wins over the shared one", () => {
    const pc = new ProductCraft({
      baseUrl: "https://shared.example",
      heimdall: { baseUrl: "https://heimdall.example" },
    });
    expect(pc.heimdall).toBeInstanceOf(Heimdall);
  });
});

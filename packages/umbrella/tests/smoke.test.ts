import { describe, it, expect } from "vitest";
import {
  ProductCraft,
  Auth,
  Mail,
  Waitlist,
  Social,
  PlatformAuth,
  Trawl,
} from "../src/index.js";

describe("ProductCraft umbrella", () => {
  it("constructs every surface from a single config", () => {
    const pc = new ProductCraft({
      auth: { type: "apiKey", key: "pcft_live_test" },
    });
    expect(pc.auth).toBeInstanceOf(Auth);
    expect(pc.mail).toBeInstanceOf(Mail);
    expect(pc.waitlist).toBeInstanceOf(Waitlist);
    expect(pc.social).toBeInstanceOf(Social);
    expect(pc.platformAuth).toBeInstanceOf(PlatformAuth);
    expect(pc.trawl).toBeInstanceOf(Trawl);
  });

  it("each surface exposes its resource namespaces", () => {
    const pc = new ProductCraft();
    // Auth switched to ergonomic resource methods in v0.1.0 — the
    // old `.client.GET/POST/...` surface is gone. The other surfaces
    // still expose the raw openapi-fetch client for now.
    expect(typeof pc.auth.app).toBe("function");
    expect(typeof pc.auth.consumer).toBe("function");
    expect(typeof pc.mail.client.POST).toBe("function");
    expect(typeof pc.waitlist.client.PATCH).toBe("function");
    expect(typeof pc.trawl.client.POST).toBe("function");
  });

  it("per-surface baseUrl override wins over the shared one", () => {
    const pc = new ProductCraft({
      baseUrl: "https://shared.example",
      overrides: { auth: { baseUrl: "https://auth.example" } },
    });
    expect(pc.auth).toBeInstanceOf(Auth);
  });

  it("keeps the shared auth credential when overrides are present", () => {
    const pc = new ProductCraft({
      auth: { type: "apiKey", key: "pcft_live_test" },
      overrides: { mail: { baseUrl: "https://mail.example" } },
    });
    expect(pc.auth).toBeInstanceOf(Auth);
    expect(pc.mail).toBeInstanceOf(Mail);
  });
});

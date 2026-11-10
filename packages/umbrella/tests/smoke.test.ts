import { describe, it, expect } from "vitest";
import { ProductCraft, Auth, Flags, Mail, Waitlist, Social, PlatformAuth, Trawl } from "../src/index.js";

describe("ProductCraft umbrella", () => {
  it("constructs every product from a single config", () => {
    const pc = new ProductCraft({ apiKey: "pcft_live_test" });
    expect(pc.auth).toBeInstanceOf(Auth);
    expect(pc.mail).toBeInstanceOf(Mail);
    expect(pc.waitlist).toBeInstanceOf(Waitlist);
    expect(pc.social).toBeInstanceOf(Social);
    expect(pc.platform).toBeInstanceOf(PlatformAuth);
    expect(pc.trawl).toBeInstanceOf(Trawl);
    expect(pc.flags).toBeInstanceOf(Flags);
  });

  it("exposes the generated resources and keeps .client", () => {
    const pc = new ProductCraft({ apiKey: "pcft_live_test" });
    expect(typeof pc.auth.admin.app).toBe("function");
    expect(typeof pc.auth.consumer).toBe("function");
    expect(typeof pc.mail.emails.send).toBe("function");
    expect(typeof pc.waitlist.lists.list).toBe("function");
    expect(typeof pc.social.communities.list).toBe("function");
    expect(typeof pc.trawl.jobs.create).toBe("function");
    expect(typeof pc.flags.projects.create).toBe("function");
    expect(typeof pc.platform.apiKeys.self).toBe("function");
    expect(typeof pc.mail.client.POST).toBe("function");
  });

  it("platformAuth is the same instance as platform", () => {
    const pc = new ProductCraft({ apiKey: "pcft_live_test" });
    expect(pc.platformAuth).toBe(pc.platform);
  });
});

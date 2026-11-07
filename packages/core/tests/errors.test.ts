import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

const { APIError, NotFoundError, ProductCraftError, ConflictError, IdempotencyKeyReuseError, RateLimitError } = core;

describe("error branding", () => {
  it("brands every class with Symbol.for and answers instanceof up the chain", () => {
    const err = APIError.generate(404, { code: "NOT_FOUND", message: "gone" }, new Headers());
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(ProductCraftError);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ConflictError);
    expect((err as unknown as Record<symbol, unknown>)[Symbol.for("productcraft.error.NotFoundError")]).toBe(true);
    expect(err.name).toBe("NotFoundError");
    expect(err.message).toBe("gone");
  });

  it("a structurally branded object from another copy of core passes instanceof", () => {
    const foreign = Object.create(Error.prototype) as Record<symbol, unknown>;
    foreign[Symbol.for("productcraft.error.ProductCraftError")] = true;
    foreign[Symbol.for("productcraft.error.APIError")] = true;
    foreign[Symbol.for("productcraft.error.ConflictError")] = true;
    expect(foreign).toBeInstanceOf(ConflictError);
    expect(foreign).toBeInstanceOf(APIError);
    expect(foreign).not.toBeInstanceOf(IdempotencyKeyReuseError);
    expect(null).not.toBeInstanceOf(APIError);
    expect("x").not.toBeInstanceOf(APIError);
  });

  it("every exported error class has its own brand", () => {
    const names = Object.entries(core)
      .filter(([, v]) => typeof v === "function" && (v as { brandName?: string }).brandName)
      .map(([k, v]) => [k, (v as { brandName: string }).brandName]);
    expect(names.length).toBe(17);
    for (const [exportName, brand] of names) {
      expect(brand).toBe(exportName);
      expect((core as Record<string, { name: string }>)[exportName as string]!.name).toBe(exportName);
    }
  });

  it("RateLimitError parses Retry-After in seconds", () => {
    const err = new RateLimitError(429, {}, new Headers({ "retry-after": "7" }));
    expect(err.retryAfter).toBe(7);
    expect(new RateLimitError(429, {}, new Headers()).retryAfter).toBeUndefined();
  });

  it("brands are non-enumerable", () => {
    const err = new NotFoundError(404, { code: "NOT_FOUND" }, new Headers());
    expect(Object.getOwnPropertySymbols(err).length).toBeGreaterThan(0);
    expect(Object.keys(err)).not.toContain("name");
  });
});

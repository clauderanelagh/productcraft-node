import { describe, it, expect } from "vitest";
import { Heimdall } from "@productcraft/heimdall";
import { createPassportSecretOrKeyProvider } from "../src/index.js";

describe("createPassportSecretOrKeyProvider", () => {
  it("returns a 3-arg function", () => {
    const heimdall = new Heimdall();
    const provider = createPassportSecretOrKeyProvider(
      heimdall.consumer("my-app"),
    );
    expect(typeof provider).toBe("function");
    expect(provider.length).toBe(3); // (request, rawJwt, done)
  });

  it("invokes done(err) when the JWT can't be decoded", async () => {
    const heimdall = new Heimdall();
    const provider = createPassportSecretOrKeyProvider(
      heimdall.consumer("my-app"),
    );
    await new Promise<void>((resolve) => {
      provider({}, "not.a.jwt", (err, key) => {
        expect(err).toBeInstanceOf(Error);
        expect(key).toBeUndefined();
        resolve();
      });
    });
  });
});

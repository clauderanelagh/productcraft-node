import { describe, it, expect, vi } from "vitest";
import { Auth } from "@productcraft/auth";
import { createAuthJwtStrategy } from "../src/index.js";

type Done = (err: unknown, user?: unknown, info?: unknown) => void;

function runVerify(
  strategy: { _verify: (...args: unknown[]) => void },
  args: unknown[],
): Promise<{ err: unknown; user: unknown; info: unknown }> {
  return new Promise((resolve) => {
    const done: Done = (err, user, info) => resolve({ err, user, info });
    strategy._verify(...args, done);
  });
}

describe("createAuthJwtStrategy refuses refresh tokens", () => {
  const scope = new Auth().consumer("my-app");

  it.each([{ token_use: "refresh" }, { type: "refresh" }])(
    "fails authentication for %o without calling the user's verify",
    async (claims) => {
      const verify = vi.fn((_p: unknown, done: Done) => done(null, { id: "u" }));
      const strategy = createAuthJwtStrategy(scope, verify);
      const r = await runVerify(strategy, [{ sub: "u", ...claims }]);
      expect(r.err).toBeNull();
      expect(r.user).toBe(false);
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it("passes access tokens through to the user's verify", async () => {
    const verify = vi.fn((_p: unknown, done: Done) => done(null, { id: "u" }));
    const strategy = createAuthJwtStrategy(scope, verify);
    const r = await runVerify(strategy, [{ sub: "u", token_use: "access" }]);
    expect(r.user).toEqual({ id: "u" });
    expect(verify).toHaveBeenCalledOnce();
  });

  it("handles passReqToCallback (req, payload, done)", async () => {
    const verify = vi.fn((_req: unknown, _p: unknown, done: Done) => done(null, { id: "u" }));
    const strategy = createAuthJwtStrategy(scope, verify as never, { passReqToCallback: true });
    const refused = await runVerify(strategy, [{}, { sub: "u", type: "refresh" }]);
    expect(refused.user).toBe(false);
    const ok = await runVerify(strategy, [{}, { sub: "u" }]);
    expect(ok.user).toEqual({ id: "u" });
  });
});

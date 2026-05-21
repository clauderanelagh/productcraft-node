/**
 * JWT verify tests — generate a keypair locally, sign tokens with
 * the private key, mock the JWKS endpoint to return the public key.
 * No network in the test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import {
  Heimdall,
  JwtExpiredError,
  JwtInvalidError,
  JwtIssuerMismatchError,
  JwtAudienceMismatchError,
} from "../src/index.js";

const BASE = "https://api.heimdall.example";
const APP = "my-app";
const ISSUER = `${BASE}/${APP}`;

interface TestRig {
  heimdall: Heimdall;
  privateKey: CryptoKey;
  fetchMock: ReturnType<typeof vi.fn>;
}

async function setup(): Promise<TestRig> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  const jwks = { keys: [{ ...jwk, kid: "test-key-1", alg: "ES256", use: "sig" }] };

  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.endsWith("/.well-known/jwks.json")) {
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });

  const heimdall = new Heimdall({
    baseUrl: BASE,
    fetch: fetchMock as unknown as typeof fetch,
  });

  return { heimdall, privateKey, fetchMock };
}

async function signToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  opts: { exp?: number | string; nbf?: number } = {},
): Promise<string> {
  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "test-key-1" })
    .setIssuedAt();
  if (opts.exp !== undefined)
    builder.setExpirationTime(opts.exp as string | number);
  if (opts.nbf !== undefined) builder.setNotBefore(opts.nbf);
  return builder.sign(privateKey);
}

describe("verifyToken", () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = await setup();
  });

  it("accepts a well-formed token signed by the JWKS's key", async () => {
    const token = await signToken(rig.privateKey, {
      sub: "user_123",
      iss: ISSUER,
      role: "member",
      permissions: ["billing.read"],
    }, { exp: "2h" });

    const claims = await rig.heimdall.consumer(APP).verifyToken(token);
    expect(claims.sub).toBe("user_123");
    expect(claims.iss).toBe(ISSUER);
    expect(claims.role).toBe("member");
    expect(claims.permissions).toEqual(["billing.read"]);
  });

  it("singleflights: 5 concurrent verifies → 1 JWKS fetch", async () => {
    const token = await signToken(
      rig.privateKey,
      { sub: "u", iss: ISSUER },
      { exp: "1h" },
    );

    const scope = rig.heimdall.consumer(APP);
    await Promise.all(Array.from({ length: 5 }, () => scope.verifyToken(token)));

    const jwksFetches = rig.fetchMock.mock.calls.filter(([input]) => {
      const url =
        input instanceof Request ? input.url : (input as URL | string).toString();
      return url.endsWith("/.well-known/jwks.json");
    });
    expect(jwksFetches).toHaveLength(1);
  });

  it("throws JwtExpiredError when exp is in the past", async () => {
    const token = await signToken(rig.privateKey, {
      sub: "u",
      iss: ISSUER,
    }, { exp: Math.floor(Date.now() / 1000) - 60 });

    await expect(
      rig.heimdall.consumer(APP).verifyToken(token),
    ).rejects.toBeInstanceOf(JwtExpiredError);
  });

  it("throws JwtIssuerMismatchError when iss doesn't match", async () => {
    const token = await signToken(rig.privateKey, {
      sub: "u",
      iss: "https://wrong-issuer.example/my-app",
    }, { exp: "1h" });

    await expect(
      rig.heimdall.consumer(APP).verifyToken(token),
    ).rejects.toBeInstanceOf(JwtIssuerMismatchError);
  });

  it("throws JwtAudienceMismatchError when aud is required + wrong", async () => {
    const token = await signToken(rig.privateKey, {
      sub: "u",
      iss: ISSUER,
      aud: "actually-different",
    }, { exp: "1h" });

    await expect(
      rig.heimdall.consumer(APP).verifyToken(token, { audience: "my-app" }),
    ).rejects.toBeInstanceOf(JwtAudienceMismatchError);
  });

  it("throws JwtInvalidError on a tampered signature", async () => {
    const token = await signToken(rig.privateKey, {
      sub: "u",
      iss: ISSUER,
    }, { exp: "1h" });
    // Replace the entire signature segment with a deterministic
    // 64-char base64url string so the signature definitely doesn't
    // match the payload. (Char-flipping is flaky because the chosen
    // char might happen to equal the original.)
    const parts = token.split(".");
    parts[2] = "A".repeat(parts[2]!.length);
    const tampered = parts.join(".");

    await expect(
      rig.heimdall.consumer(APP).verifyToken(tampered),
    ).rejects.toBeInstanceOf(JwtInvalidError);
  });
});

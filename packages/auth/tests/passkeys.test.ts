/**
 * Passkey helpers: the encoding layer against a real
 * PublicKeyCredential-shaped fixture, the browser-support probe, and
 * each ceremony's HTTP sequence with fetch stubbed and a fake
 * `navigator.credentials` injected.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Auth,
  toB64u,
  fromB64u,
  decodeOptions,
  encodeCredential,
  isPasskeySupported,
  createPasskeyCredential,
  getPasskeyCredential,
  PasskeyError,
  type PasskeyCredentialLike,
  type PasskeyCredentialsContainer,
} from "../src/index.js";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

/**
 * Bytes chosen so plain base64 would emit `+`, `/` AND `=` padding:
 * 0xFB 0xFF → "+/8=", 0xFF 0xEF → "/+8=", etc. Every length mod 3 is
 * covered so all three padding cases are exercised.
 */
const bytes = (...xs: number[]): ArrayBuffer => Uint8Array.from(xs).buffer;
const clientDataJSON = new TextEncoder().encode(
  JSON.stringify({ type: "webauthn.get", challenge: "abc", origin: "http://localhost:4787" }),
).buffer;

/** What navigator.credentials.create() hands back (attestation). */
const attestationFixture: PasskeyCredentialLike = {
  id: "Y3JlZC1pZC0x",
  response: {
    clientDataJSON,
    attestationObject: bytes(0xfb, 0xff, 0xbf, 0xfe, 0x3e, 0x3f, 0xff, 0xef, 0xff, 0x00),
  },
};

/** What navigator.credentials.get() hands back (assertion). */
const assertionFixture: PasskeyCredentialLike = {
  id: "Y3JlZC1pZC0x",
  response: {
    clientDataJSON,
    authenticatorData: bytes(0xff, 0xef, 0xff, 0xfb, 0xff), // 5 bytes → 1 pad char in base64
    signature: bytes(0x3e, 0x3f, 0xfb, 0xff), // 4 bytes → 2 pad chars in base64
    userHandle: bytes(0xfb, 0xff, 0xbf), // 3 bytes → no pad, but + and /
  },
};

const B64URL_ALPHABET = /^[A-Za-z0-9_-]+$/;

function everyBufferField(enc: { response: Record<string, unknown> }): string[] {
  return Object.values(enc.response).filter((v): v is string => typeof v === "string");
}

// ─────────────────────────────────────────────────────────────
// Encoding layer
// ─────────────────────────────────────────────────────────────

describe("passkeys — base64url encoding layer", () => {
  it("toB64u emits base64url on bytes that would need +, / and = in plain base64", () => {
    expect(toB64u(bytes(0xfb, 0xff))).toBe("-_8");
    expect(toB64u(bytes(0xff, 0xef))).toBe("_-8");
    expect(toB64u(bytes(0x3e, 0x3f, 0xfb, 0xff))).toBe("Pj_7_w");
  });

  it("encodeCredential (attestation) — every buffer is base64url: no '+', '/' or '='", () => {
    const enc = encodeCredential(attestationFixture);
    const fields = everyBufferField(enc);
    expect(fields.length).toBe(2); // clientDataJSON + attestationObject
    for (const v of fields) {
      expect(v).not.toMatch(/[+/=]/);
      expect(v).toMatch(B64URL_ALPHABET);
    }
    expect(enc.id).toBe(attestationFixture.id);
    expect(Object.keys(enc.response).sort()).toEqual(["attestationObject", "clientDataJSON"]);
  });

  it("encodeCredential (assertion) — every buffer is base64url, member names verbatim", () => {
    const enc = encodeCredential(assertionFixture);
    const fields = everyBufferField(enc);
    expect(fields.length).toBe(4);
    for (const v of fields) {
      expect(v).not.toMatch(/[+/=]/);
      expect(v).toMatch(B64URL_ALPHABET);
    }
    // Spec-fixed names, NOT snake_cased.
    expect(Object.keys(enc.response).sort()).toEqual([
      "authenticatorData",
      "clientDataJSON",
      "signature",
      "userHandle",
    ]);
    expect(enc.response).not.toHaveProperty("client_data_json");
  });

  it("round trip is lossless for every buffer on both fixtures", () => {
    for (const fx of [attestationFixture, assertionFixture]) {
      const enc = encodeCredential(fx);
      for (const [k, original] of Object.entries(fx.response)) {
        if (!original) continue;
        const back = fromB64u((enc.response as Record<string, string>)[k]!);
        expect(Array.from(back)).toEqual(Array.from(new Uint8Array(original)));
      }
    }
  });

  it("round trip is lossless across all padding lengths (1..64 bytes)", () => {
    for (let len = 1; len <= 64; len++) {
      const src = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 0xfb) & 0xff);
      const enc = toB64u(src);
      expect(enc).not.toMatch(/[+/=]/);
      expect(Array.from(fromB64u(enc))).toEqual(Array.from(src));
    }
  });

  it("toB64u accepts a typed-array view with a byteOffset", () => {
    const backing = Uint8Array.from([0, 0, 0xfb, 0xff, 0, 0]);
    const view = new Uint8Array(backing.buffer, 2, 2);
    expect(toB64u(view)).toBe("-_8");
  });

  it("decodeOptions turns challenge, user.id and credential ids into bytes, leaves the rest", () => {
    const out = decodeOptions({
      challenge: "-_8",
      rp: { id: "localhost", name: "Demo" },
      user: { id: "Pj_7_w", name: "ada", displayName: "Ada" },
      excludeCredentials: [{ id: "_-8", type: "public-key", transports: ["internal"] }],
      allowCredentials: [],
      timeout: 60000,
      userVerification: "required",
    });
    expect(Array.from(out.challenge)).toEqual([0xfb, 0xff]);
    expect(Array.from(out.user!.id)).toEqual([0x3e, 0x3f, 0xfb, 0xff]);
    expect(out.user!.name).toBe("ada");
    expect(Array.from(out.excludeCredentials![0]!.id)).toEqual([0xff, 0xef]);
    expect(out.excludeCredentials![0]!.transports).toEqual(["internal"]);
    expect(out.allowCredentials).toEqual([]);
    expect(out.rp).toEqual({ id: "localhost", name: "Demo" });
    expect(out.timeout).toBe(60000);
    expect(out.userVerification).toBe("required");
  });

  it("decodeOptions accepts the snake_case public_key Auth actually emits and yields WebAuthn member names", () => {
    // Captured live from POST /:slug/v1/me/mfa/factors {type:webauthn} and
    // /auth/passkey/options: the global wire decamelizer reaches inside
    // public_key, so the browser would never see pubKeyCredParams et al.
    const creation = decodeOptions({
      challenge: "-_8",
      rp: { id: "localhost", name: "Demo" },
      user: { id: "Pj_7_w", name: "passkey", display_name: "passkey" },
      pub_key_cred_params: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      timeout: 300000,
      attestation: "none",
      exclude_credentials: [{ type: "public-key", id: "_-8", transports: ["internal"] }],
      authenticator_selection: {
        resident_key: "preferred",
        require_resident_key: false,
        user_verification: "required",
      },
    } as never);
    expect(Array.from(creation.challenge)).toEqual([0xfb, 0xff]);
    expect(Array.from(creation.user!.id)).toEqual([0x3e, 0x3f, 0xfb, 0xff]);
    expect((creation.user as { displayName?: string }).displayName).toBe("passkey");
    expect(creation).not.toHaveProperty("pub_key_cred_params");
    expect(creation.pubKeyCredParams).toEqual([
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ]);
    expect(creation.authenticatorSelection).toEqual({
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification: "required",
    });
    expect(creation).not.toHaveProperty("exclude_credentials");
    expect(Array.from(creation.excludeCredentials![0]!.id)).toEqual([0xff, 0xef]);
    expect(creation.excludeCredentials![0]!.type).toBe("public-key"); // values untouched
    expect(creation.attestation).toBe("none");

    const request = decodeOptions({
      challenge: "-_8",
      rp_id: "localhost",
      timeout: 300000,
      user_verification: "required",
      allow_credentials: [],
    } as never);
    expect(request.rpId).toBe("localhost");
    expect(request).not.toHaveProperty("rp_id");
    expect(request.userVerification).toBe("required");
    expect(request.allowCredentials).toEqual([]);
    expect(request).not.toHaveProperty("allow_credentials");
  });

  it("decodeOptions leaves user/excludeCredentials absent when the server omits them", () => {
    const out = decodeOptions({ challenge: "-_8", rpId: "localhost", allowCredentials: [] });
    expect(out).not.toHaveProperty("user");
    expect(out).not.toHaveProperty("excludeCredentials");
  });
});

// ─────────────────────────────────────────────────────────────
// isPasskeySupported + browser bridge
// ─────────────────────────────────────────────────────────────

describe("passkeys — isPasskeySupported", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false in Node and does not throw", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(isPasskeySupported()).toBe(false);
  });

  it("is true with window + PublicKeyCredential + navigator.credentials in a secure context", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", { credentials: { create: async () => null, get: async () => null } });
    expect(isPasskeySupported()).toBe(true);
  });

  it("is false when the context is insecure or PublicKeyCredential is missing", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { credentials: { create: async () => null, get: async () => null } });
    vi.stubGlobal("isSecureContext", true);
    expect(isPasskeySupported()).toBe(false); // no PublicKeyCredential
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
    vi.stubGlobal("isSecureContext", false);
    expect(isPasskeySupported()).toBe(false); // insecure context
  });
});

describe("passkeys — browser bridge error mapping", () => {
  const publicKey = { challenge: "-_8", rpId: "localhost", allowCredentials: [] };

  it("rejects with PasskeyError(unsupported) when navigator.credentials is absent", async () => {
    const err = await getPasskeyCredential(publicKey).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PasskeyError);
    expect((err as PasskeyError).code).toBe("unsupported");
  });

  it("maps NotAllowedError → cancelled and keeps the DOM error as cause", async () => {
    const dom = Object.assign(new Error("The operation either timed out or was not allowed."), {
      name: "NotAllowedError",
    });
    const creds: PasskeyCredentialsContainer = {
      create: async () => null,
      get: async () => {
        throw dom;
      },
    };
    const err = await getPasskeyCredential(publicKey, { credentials: creds }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PasskeyError);
    expect((err as PasskeyError).code).toBe("cancelled");
    expect((err as PasskeyError).cause).toBe(dom);
  });

  it("maps TimeoutError (AbortSignal.timeout) → timeout with a clear message", async () => {
    const dom = Object.assign(new Error("signal timed out"), { name: "TimeoutError" });
    const creds: PasskeyCredentialsContainer = {
      create: async () => null,
      get: async () => {
        throw dom;
      },
    };
    const err = await getPasskeyCredential(publicKey, { credentials: creds }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(PasskeyError);
    expect((err as PasskeyError).code).toBe("timeout");
    expect((err as PasskeyError).message).toMatch(/timed out/i);
  });

  it("maps a null credential → no_credential", async () => {
    const creds: PasskeyCredentialsContainer = {
      create: async () => null,
      get: async () => null,
    };
    const err = await createPasskeyCredential(publicKey, { credentials: creds }).catch(
      (e: unknown) => e,
    );
    expect((err as PasskeyError).code).toBe("no_credential");
  });

  it("hands navigator.credentials decoded bytes and returns the encoded credential", async () => {
    let seen: unknown;
    const creds: PasskeyCredentialsContainer = {
      create: async () => null,
      get: async (o) => {
        seen = o;
        return assertionFixture;
      },
    };
    const enc = await getPasskeyCredential(publicKey, {
      credentials: creds,
      mediation: "conditional",
    });
    const pk = (seen as { publicKey: { challenge: Uint8Array }; mediation: string }).publicKey;
    expect(Array.from(pk.challenge)).toEqual([0xfb, 0xff]);
    expect((seen as { mediation: string }).mediation).toBe("conditional");
    expect(enc.response.signature).toBe("Pj_7_w");
  });
});

// ─────────────────────────────────────────────────────────────
// Ceremonies — HTTP sequence with fetch stubbed
// ─────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function makeSequencedFetch(responses: unknown[]) {
  const calls: CapturedRequest[] = [];
  let i = 0;
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers as Record<string, string> | undefined).forEach(
      (v, k) => (headers[k] = v),
    );
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, headers, body });
    const payload = responses[i++] ?? {};
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch, calls };
}

const BASE = "https://api.auth.example";
const SLUG = "demo";

function makeScope(responses: unknown[], token = "eyJ.enduser.tok") {
  const ff = makeSequencedFetch(responses);
  const auth = new Auth({
    baseUrl: BASE,
    fetch: ff.fetch,
    auth: { type: "bearer", token },
  });
  return { scope: auth.consumer(SLUG), calls: ff.calls };
}

const creationPublicKey = {
  rp: { id: "localhost", name: "Demo" },
  user: { id: "dXNlci0x", name: "ada@example.com", displayName: "Ada" },
  challenge: "-_8",
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  excludeCredentials: [{ id: "_-8", type: "public-key" }],
  authenticatorSelection: { residentKey: "required", userVerification: "required" },
  timeout: 60000,
};
const requestPublicKey = {
  challenge: "Pj_7_w",
  rpId: "localhost",
  allowCredentials: [],
  userVerification: "required",
  timeout: 60000,
};

function fakeCreds(record: { create?: unknown; get?: unknown } = {}): PasskeyCredentialsContainer {
  return {
    create: async (o) => {
      record.create = o;
      return attestationFixture;
    },
    get: async (o) => {
      record.get = o;
      return assertionFixture;
    },
  };
}

describe("consumer.passkeys — ceremonies", () => {
  it("enroll: POST /me/mfa/factors {type:webauthn} → create → POST /me/mfa/factors/:id/verify {credential}", async () => {
    const { scope, calls } = makeScope([
      {
        factor: { id: "fac_1", type: "webauthn", enabled: false },
        enrollment: { public_key: creationPublicKey },
      },
      { factor: { id: "fac_1", type: "webauthn", enabled: true }, recovery_codes: ["a", "b"] },
    ]);
    const rec: { create?: unknown } = {};
    const done = await scope.passkeys.enroll({ credentials: fakeCreds(rec), label: "MacBook" });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/${SLUG}/v1/me/mfa/factors`,
      `POST ${BASE}/${SLUG}/v1/me/mfa/factors/fac_1/verify`,
    ]);
    expect(calls[0]!.body).toEqual({ type: "webauthn", label: "MacBook" });
    expect(calls[0]!.headers.authorization).toBe("Bearer eyJ.enduser.tok");
    // The browser got real bytes…
    const created = rec.create as { publicKey: { challenge: Uint8Array; user: { id: Uint8Array } } };
    expect(Array.from(created.publicKey.challenge)).toEqual([0xfb, 0xff]);
    expect(created.publicKey.user.id).toBeInstanceOf(Uint8Array);
    // …and the verify body carries the encoded credential, response names verbatim.
    expect(calls[1]!.body).toEqual({ credential: encodeCredential(attestationFixture) });
    expect(Object.keys((calls[1]!.body as { credential: { response: object } }).credential.response)).toEqual(
      ["clientDataJSON", "attestationObject"],
    );
    expect(done.recovery_codes).toEqual(["a", "b"]);
  });

  it("enroll: omits label when not given", async () => {
    const { scope, calls } = makeScope([
      { factor: { id: "fac_2" }, enrollment: { public_key: creationPublicKey } },
      { factor: { id: "fac_2" }, recovery_codes: [] },
    ]);
    await scope.passkeys.enroll({ credentials: fakeCreds() });
    expect(calls[0]!.body).toEqual({ type: "webauthn" });
  });

  it("signIn: POST /auth/passkey/options {} (EMPTY body, no identifier) → get → POST /auth/passkey/verify", async () => {
    const { scope, calls } = makeScope(
      [
        { public_key: requestPublicKey },
        { access_token: "at", refresh_token: "rt", token_type: "Bearer", expires_in: 3600 },
      ],
      "",
    );
    const rec: { get?: unknown } = {};
    const session = await scope.passkeys.signIn({ credentials: fakeCreds(rec), mediation: "conditional" });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/${SLUG}/v1/auth/passkey/options`,
      `POST ${BASE}/${SLUG}/v1/auth/passkey/verify`,
    ]);
    expect(calls[0]!.body).toEqual({});
    expect(JSON.stringify(calls[0]!.body)).not.toMatch(/email|identifier|username/);
    expect((rec.get as { mediation: string }).mediation).toBe("conditional");
    expect(calls[1]!.body).toEqual({ credential: encodeCredential(assertionFixture) });
    expect(session.access_token).toBe("at");
  });

  it("signIn: forwards tenant_id only when given", async () => {
    const { scope, calls } = makeScope([{ public_key: requestPublicKey }, { access_token: "at" }]);
    await scope.passkeys.signIn({ credentials: fakeCreds(), tenant_id: "ten_1" });
    expect(calls[0]!.body).toEqual({ tenant_id: "ten_1" });
  });

  it("every ceremony rejects PasskeyError(unsupported) BEFORE its options call when no authenticator exists", async () => {
    // An unsupported client must not mint a server-side challenge it can
    // never answer, so the check runs before the first request.
    const { scope, calls } = makeScope([{ public_key: requestPublicKey }]);
    for (const run of [
      () => scope.passkeys.signIn(),
      () => scope.passkeys.enroll(),
      () => scope.passkeys.stepUp(),
      () => scope.passkeys.completeMfaChallenge({ mfa_token: "mfa_abc" }),
    ]) {
      const err = await run().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PasskeyError);
      expect((err as PasskeyError).code).toBe("unsupported");
    }
    expect(calls).toHaveLength(0); // nothing reached the network
  });

  it("completeMfaChallenge: POST /auth/mfa/webauthn/options {mfa_token} → get → POST /auth/mfa/verify {mfa_token, credential}", async () => {
    const { scope, calls } = makeScope([
      { public_key: requestPublicKey },
      { access_token: "at2", refresh_token: "rt2" },
    ]);
    const session = await scope.passkeys.completeMfaChallenge({
      mfa_token: "mfa_abc",
      credentials: fakeCreds(),
    });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/${SLUG}/v1/auth/mfa/webauthn/options`,
      `POST ${BASE}/${SLUG}/v1/auth/mfa/verify`,
    ]);
    expect(calls[0]!.body).toEqual({ mfa_token: "mfa_abc" });
    expect(calls[1]!.body).toEqual({
      mfa_token: "mfa_abc",
      credential: encodeCredential(assertionFixture),
    });
    expect(calls[1]!.body).not.toHaveProperty("code");
    expect(session.access_token).toBe("at2");
  });

  it("stepUp: POST /me/mfa/step-up/webauthn/options → get → POST /me/mfa/step-up {credential}", async () => {
    const { scope, calls } = makeScope([
      { public_key: requestPublicKey },
      { amr: ["pwd", "webauthn"], mfa_at: "2026-09-20T10:00:00Z" },
    ]);
    const res = await scope.passkeys.stepUp({ credentials: fakeCreds() });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/${SLUG}/v1/me/mfa/step-up/webauthn/options`,
      `POST ${BASE}/${SLUG}/v1/me/mfa/step-up`,
    ]);
    expect(calls[0]!.headers.authorization).toBe("Bearer eyJ.enduser.tok");
    expect(calls[1]!.body).toEqual({ credential: encodeCredential(assertionFixture) });
    expect(res.amr).toEqual(["pwd", "webauthn"]);
  });
});

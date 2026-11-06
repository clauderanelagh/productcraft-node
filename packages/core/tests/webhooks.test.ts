import { describe, expect, it } from "vitest";
import { APIClient, ConfigurationError, verifyWebhook, WebhookVerificationError } from "../src/index.js";

// Standard Webhooks published test vector (standard-webhooks spec / libraries).
const STD = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  ts: 1614265330,
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const stdNow = STD.ts * 1000;

// Produced by the monorepo's signing code path (apps/mail-api/src/outbound-webhooks/signer.ts:
// signStandardWebhook with [current, previous] and signPayload) using throwaway test secrets.
const MONO = {
  current: "whsec_BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  previous: "legacy-secret-0123456789abcdefghijklmnopqrstu",
  body: '{"type":"email.bounced","data":{"recipient":"bounce@simulator.amazonses.com"}}',
  id: "msg_2Yb6sdk",
  ts: 1762400000,
  signature: "v1,KVwtcx/da7biOJEZRywOH3mBw1jd0WmZm29JMEGvs80= v1,iFKrd+Hysk3t4QwAVcr9ZT9PyASoKrBCL8Z7/E1vT9Q=",
  legacySecret: "trawl-test-secret",
  legacyHeader: "t=1762400000,v1=bf6dd3b6ac87809995e8e4fb462ff40e7b545287bbe4733ed7537f2c31dddff8",
};
const monoNow = MONO.ts * 1000;

const stdHeaders = (sig = STD.signature) => ({ "webhook-id": STD.id, "webhook-timestamp": String(STD.ts), "webhook-signature": sig });

describe("verifyWebhook: Standard Webhooks", () => {
  it("accepts the published vector and returns the parsed payload", async () => {
    await expect(verifyWebhook({ payload: STD.payload, headers: stdHeaders(), secret: STD.secret, now: stdNow })).resolves.toEqual({ test: 2432232314 });
  });

  it("accepts Fetch Headers, Node IncomingHttpHeaders (mixed case, arrays) and byte payloads", async () => {
    const fetchHeaders = new Headers(stdHeaders());
    await expect(verifyWebhook({ payload: STD.payload, headers: fetchHeaders, secret: STD.secret, now: stdNow })).resolves.toBeTruthy();
    const nodeHeaders = { "Webhook-Id": STD.id, "webhook-timestamp": String(STD.ts), "webhook-signature": [STD.signature] };
    await expect(verifyWebhook({ payload: new TextEncoder().encode(STD.payload), headers: nodeHeaders, secret: STD.secret, now: stdNow })).resolves.toBeTruthy();
    const buf = Buffer.from(STD.payload);
    await expect(verifyWebhook({ payload: buf, headers: stdHeaders(), secret: STD.secret, now: stdNow })).resolves.toBeTruthy();
    const ab = new TextEncoder().encode(STD.payload).buffer as ArrayBuffer;
    await expect(verifyWebhook({ payload: ab, headers: stdHeaders(), secret: STD.secret, now: stdNow })).resolves.toBeTruthy();
  });

  it("rejects a tampered body", async () => {
    const err = await verifyWebhook({ payload: '{"test": 2432232315}', headers: stdHeaders(), secret: STD.secret, now: stdNow }).catch((e) => e);
    expect(err).toBeInstanceOf(WebhookVerificationError);
  });

  it("rejects a wrong secret, a wrong id and a non-v1 signature", async () => {
    const wrong = "whsec_" + Buffer.alloc(24, 1).toString("base64");
    await expect(verifyWebhook({ payload: STD.payload, headers: stdHeaders(), secret: wrong, now: stdNow })).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook({ payload: STD.payload, headers: { ...stdHeaders(), "webhook-id": "msg_other" }, secret: STD.secret, now: stdNow })).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook({ payload: STD.payload, headers: stdHeaders(STD.signature.replace("v1,", "v2,")), secret: STD.secret, now: stdNow })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("enforces the tolerance window both ways", async () => {
    const at = (offsetS: number) => verifyWebhook({ payload: STD.payload, headers: stdHeaders(), secret: STD.secret, now: stdNow + offsetS * 1000 });
    await expect(at(299)).resolves.toBeTruthy();
    await expect(at(-299)).resolves.toBeTruthy();
    await expect(at(301)).rejects.toThrow(/too old/);
    await expect(at(-301)).rejects.toThrow(/future/);
    await expect(verifyWebhook({ payload: STD.payload, headers: stdHeaders(), secret: STD.secret, now: stdNow + 600_000, toleranceSeconds: 700 })).resolves.toBeTruthy();
  });

  it("verifies the monorepo signer's rotation header with either secret, or an array of secrets", async () => {
    const headers = { "webhook-id": MONO.id, "webhook-timestamp": String(MONO.ts), "webhook-signature": MONO.signature };
    const expected = JSON.parse(MONO.body);
    await expect(verifyWebhook({ payload: MONO.body, headers, secret: MONO.current, now: monoNow })).resolves.toEqual(expected);
    // A pre-whsec Mail secret is used as its UTF-8 bytes.
    await expect(verifyWebhook({ payload: MONO.body, headers, secret: MONO.previous, now: monoNow })).resolves.toEqual(expected);
    await expect(verifyWebhook({ payload: MONO.body, headers, secret: ["whsec_" + Buffer.alloc(32, 9).toString("base64"), MONO.current], now: monoNow })).resolves.toEqual(expected);
    await expect(verifyWebhook({ payload: MONO.body, headers, secret: ["nope-1", "nope-2"], now: monoNow })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("rejects missing headers and parsed-object payloads", async () => {
    await expect(verifyWebhook({ payload: STD.payload, headers: { "webhook-id": STD.id }, secret: STD.secret, now: stdNow })).rejects.toThrow(/Missing/);
    await expect(verifyWebhook({ payload: STD.payload, headers: {}, secret: STD.secret, now: stdNow })).rejects.toThrow(/No webhook signature/);
    await expect(verifyWebhook({ payload: { test: 1 } as unknown as string, headers: stdHeaders(), secret: STD.secret, now: stdNow })).rejects.toThrow(/raw request body/);
    await expect(verifyWebhook({ payload: STD.payload, headers: stdHeaders(), secret: [], now: stdNow })).rejects.toThrow(/No webhook secret/);
  });
});

describe("verifyWebhook: legacy X-<Product>-Signature", () => {
  it("verifies the monorepo signPayload vector (t=,v1=hex)", async () => {
    await expect(verifyWebhook({ payload: MONO.body, headers: { "X-Trawl-Signature": MONO.legacyHeader }, secret: MONO.legacySecret, now: monoNow })).resolves.toEqual(JSON.parse(MONO.body));
    await expect(verifyWebhook({ payload: MONO.body, headers: new Headers({ "x-auth-signature": MONO.legacyHeader }), secret: [MONO.current, MONO.legacySecret], now: monoNow })).resolves.toBeTruthy();
  });

  it("rejects tampering, a stale timestamp and a malformed header", async () => {
    await expect(verifyWebhook({ payload: MONO.body + " ", headers: { "x-trawl-signature": MONO.legacyHeader }, secret: MONO.legacySecret, now: monoNow })).rejects.toBeInstanceOf(WebhookVerificationError);
    await expect(verifyWebhook({ payload: MONO.body, headers: { "x-trawl-signature": MONO.legacyHeader }, secret: MONO.legacySecret, now: monoNow + 301_000 })).rejects.toThrow(/too old/);
    await expect(verifyWebhook({ payload: MONO.body, headers: { "x-trawl-signature": "v1=abc" }, secret: MONO.legacySecret, now: monoNow })).rejects.toThrow(/Malformed/);
  });
});

describe("APIClient.unwrapWebhook", () => {
  it("takes the secret from the argument, the client, then the environment variable", async () => {
    const headers = stdHeaders();
    const c = new APIClient({ webhookSecret: STD.secret }, "http://x");
    // Tolerance is checked against the real clock here, so widen it for the 2021 vector.
    const tolerance = Math.ceil((Date.now() - stdNow) / 1000) + 60;
    await expect(c.unwrapWebhook({ payload: STD.payload, headers, toleranceSeconds: tolerance })).resolves.toEqual({ test: 2432232314 });
    const bare = new APIClient({}, "http://x");
    await expect(bare.unwrapWebhook({ payload: STD.payload, headers, toleranceSeconds: tolerance }, "PRODUCTCRAFT_TEST_WEBHOOK_SECRET")).rejects.toBeInstanceOf(ConfigurationError);
    process.env.PRODUCTCRAFT_TEST_WEBHOOK_SECRET = STD.secret;
    try {
      await expect(bare.unwrapWebhook({ payload: STD.payload, headers, toleranceSeconds: tolerance }, "PRODUCTCRAFT_TEST_WEBHOOK_SECRET")).resolves.toBeTruthy();
    } finally {
      delete process.env.PRODUCTCRAFT_TEST_WEBHOOK_SECRET;
    }
  });
});

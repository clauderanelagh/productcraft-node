/**
 * Webhook signature verification, shared by every product.
 *
 * Two schemes are accepted:
 *
 * - **Standard Webhooks** (`webhook-id`, `webhook-timestamp`,
 *   `webhook-signature: v1,<base64> [v1,<base64> ...]`), HMAC-SHA256 over
 *   `<id>.<timestamp>.<body>`. A `whsec_` secret is base64 key bytes; any
 *   other secret is used as its UTF-8 bytes (Mail secrets minted before
 *   Standard Webhooks support).
 * - **Legacy** `X-<Product>-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256
 *   over `<t>.<body>` with the secret's UTF-8 bytes (Auth audit sink,
 *   Trawl, Social, Mail's first scheme).
 *
 * Uses `crypto.subtle` only (Node 20.3+, Bun, Deno, edge) and compares in
 * constant time.
 */

import { WebhookVerificationError } from "./errors.js";

/** Node `IncomingHttpHeaders`, a Fetch `Headers`, or any plain header record. */
export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | Iterable<[string, string]>;

/** The raw request body, exactly as received. Never a parsed object. */
export type WebhookPayload = string | Uint8Array | ArrayBuffer;

export interface VerifyWebhookParams {
  payload: WebhookPayload;
  headers: WebhookHeaders;
  /** One secret, or several (Mail: default, per-domain and endpoint secrets; rotation). */
  secret: string | readonly string[];
  /** Maximum age (and clock skew) of the timestamp, in seconds. Default 300. */
  toleranceSeconds?: number;
  /** Override "now" (ms since epoch), for tests. */
  now?: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Lower-case header lookup over every supported header shape. */
export function normalizeHeaders(headers: WebhookHeaders): Map<string, string> {
  const out = new Map<string, string>();
  if (!headers) return out;
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    const value = Array.isArray(v) ? v.map(String).join(" ") : String(v);
    out.set(k.toLowerCase(), value);
  };
  if (typeof (headers as Headers).forEach === "function" && typeof (headers as Headers).get === "function") {
    (headers as Headers).forEach((v, k) => put(k, v));
    return out;
  }
  if (typeof (headers as Iterable<[string, string]>)[Symbol.iterator] === "function") {
    for (const [k, v] of headers as Iterable<[string, string]>) put(k, v);
    return out;
  }
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) put(k, v);
  return out;
}

function payloadBytes(payload: unknown): Uint8Array {
  if (typeof payload === "string") return encoder.encode(payload);
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  throw new WebhookVerificationError(
    "Webhook payload must be the raw request body (string, Buffer, Uint8Array or ArrayBuffer), not a parsed object. " +
      "Read the body before any JSON parser runs (express.raw(), `await req.text()`).",
  );
}

function base64ToBytes(b64: string): Uint8Array | undefined {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

function hexToBytes(hex: string): Uint8Array | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return undefined;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time comparison of two byte strings (length is not secret). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new WebhookVerificationError("crypto.subtle is unavailable in this runtime (Node 20.3+ required).");
  }
  type Bytes = Parameters<typeof subtle.sign>[2];
  const k = await subtle.importKey("raw", key as Bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data as Bytes));
}

function standardKey(secret: string): Uint8Array {
  if (secret.startsWith("whsec_")) {
    const bytes = base64ToBytes(secret.slice("whsec_".length));
    if (!bytes) throw new WebhookVerificationError("Webhook secret is not valid base64 after the whsec_ prefix.");
    return bytes;
  }
  return encoder.encode(secret);
}

function checkTimestamp(ts: number, toleranceSeconds: number, now: number): void {
  const nowSeconds = Math.floor(now / 1000);
  if (nowSeconds - ts > toleranceSeconds) throw new WebhookVerificationError("Webhook timestamp is too old.");
  if (ts - nowSeconds > toleranceSeconds) throw new WebhookVerificationError("Webhook timestamp is too far in the future.");
}

function parseTimestamp(raw: string): number {
  if (!/^\d+$/.test(raw.trim())) throw new WebhookVerificationError("Webhook timestamp header is not a unix timestamp.");
  return Number(raw.trim());
}

function findLegacyHeader(h: Map<string, string>): string | undefined {
  for (const [k, v] of h) if (/^x-[a-z0-9-]+-signature$/.test(k)) return v;
  return undefined;
}

/**
 * Verify a webhook's signature and timestamp, then return the parsed
 * JSON payload. Throws `WebhookVerificationError` on any failure.
 *
 * @example
 * const event = await verifyWebhook({ payload: rawBody, headers: req.headers, secret: process.env.WEBHOOK_SECRET! });
 */
export async function verifyWebhook<T = unknown>(params: VerifyWebhookParams): Promise<T> {
  const { headers, toleranceSeconds = 300 } = params;
  const now = params.now ?? Date.now();
  const secrets = (typeof params.secret === "string" ? [params.secret] : [...(params.secret ?? [])]).filter(
    (s) => typeof s === "string" && s !== "",
  );
  if (secrets.length === 0) throw new WebhookVerificationError("No webhook secret was given.");
  const body = payloadBytes(params.payload);
  const h = normalizeHeaders(headers);

  const id = h.get("webhook-id");
  const timestamp = h.get("webhook-timestamp");
  const signature = h.get("webhook-signature");
  let verified = false;

  if (id !== undefined || timestamp !== undefined || signature !== undefined) {
    if (!id || !timestamp || !signature) {
      throw new WebhookVerificationError("Missing webhook-id, webhook-timestamp or webhook-signature header.");
    }
    const ts = parseTimestamp(timestamp);
    checkTimestamp(ts, toleranceSeconds, now);
    const candidates = signature
      .split(" ")
      .map((entry) => entry.split(",", 2))
      .filter(([version, sig]) => version === "v1" && !!sig)
      .map(([, sig]) => base64ToBytes(sig as string))
      .filter((b): b is Uint8Array => !!b);
    const signed = concat(encoder.encode(`${id}.${ts}.`), body);
    for (const secret of secrets) {
      const expected = await hmacSha256(standardKey(secret), signed);
      // Compare against every candidate so timing does not reveal which matched.
      for (const c of candidates) if (timingSafeEqual(expected, c)) verified = true;
    }
  } else {
    const legacy = findLegacyHeader(h);
    if (!legacy) throw new WebhookVerificationError("No webhook signature header found.");
    let t: string | undefined;
    const sigs: Uint8Array[] = [];
    for (const part of legacy.split(",").map((p) => p.trim())) {
      if (part.startsWith("t=")) t = part.slice(2);
      else if (part.startsWith("v1=")) {
        const b = hexToBytes(part.slice(3));
        if (b) sigs.push(b);
      }
    }
    if (t === undefined || sigs.length === 0) throw new WebhookVerificationError("Malformed signature header.");
    const ts = parseTimestamp(t);
    checkTimestamp(ts, toleranceSeconds, now);
    const signed = concat(encoder.encode(`${ts}.`), body);
    for (const secret of secrets) {
      const expected = await hmacSha256(encoder.encode(secret), signed);
      for (const c of sigs) if (timingSafeEqual(expected, c)) verified = true;
    }
  }

  if (!verified) throw new WebhookVerificationError("Webhook signature does not match.");
  const text = decoder.decode(body);
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new WebhookVerificationError("Webhook payload is not valid JSON.", { cause });
  }
}

export interface SignWebhookParams {
  /**
   * The event to sign: a string or bytes are signed as-is; any other value is
   * `JSON.stringify`-ed first (the returned `payload` is that exact string).
   */
  payload: WebhookPayload | Record<string, unknown> | unknown[];
  /** The endpoint's signing secret (`whsec_…`, or a plain pre-Standard-Webhooks secret). */
  secret: string;
  /** `webhook-id`. Default: a random `msg_…` id. */
  id?: string;
  /** Unix seconds for `webhook-timestamp`. Default: now. */
  timestamp?: number;
}

export interface SignedWebhook {
  /** The exact body that was signed: send or verify this, byte for byte. */
  payload: string;
  /** `webhook-id`, `webhook-timestamp`, `webhook-signature` (and `content-type`). */
  headers: Record<string, string>;
}

/**
 * Sign a payload the way ProductCraft signs webhooks (Standard Webhooks,
 * `v1,<base64 HMAC-SHA256>` over `<id>.<timestamp>.<body>`), for testing your
 * handler without a live delivery. `verifyWebhook` and `webhooks.unwrap`
 * accept the result.
 *
 * @example
 * const { payload, headers } = await signWebhook({ payload: { id: "evt_1", type: "user.signup", data: {} }, secret });
 * const event = await verifyWebhook({ payload, headers, secret });
 */
export async function signWebhook(params: SignWebhookParams): Promise<SignedWebhook> {
  const { secret } = params;
  if (typeof secret !== "string" || secret === "") throw new WebhookVerificationError("No webhook secret was given.");
  const raw = params.payload;
  const payload =
    typeof raw === "string"
      ? raw
      : raw instanceof Uint8Array || raw instanceof ArrayBuffer
        ? decoder.decode(raw)
        : JSON.stringify(raw);
  const id = params.id ?? `msg_${randomHex(16)}`;
  const timestamp = Math.floor(params.timestamp ?? Date.now() / 1000);
  const mac = await hmacSha256(standardKey(secret), encoder.encode(`${id}.${timestamp}.${payload}`));
  return {
    payload,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${bytesToBase64(mac)}`,
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

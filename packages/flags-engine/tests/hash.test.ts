// The pure-TS SHA-1 / SHA-256 against node:crypto over random inputs, multibyte UTF-8 included.
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bucket, hashConfidential } from "../src/index.js";
import { sha1Hex, sha256Hex, utf8 } from "../src/sha.js";

const ALPHABET = ["a", "Z", "0", " ", "@", "é", "ü", "☃", "中", "😀", "\u0000", "\u007f", "\u0080", "߿", "ࠀ", "￿", "\ud800", "\udfff"];
function randomString(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomBytes(1)[0]! % ALPHABET.length];
  return s;
}

describe("utf8", () => {
  it("matches Buffer for random strings, lone surrogates included", () => {
    for (let i = 0; i < 500; i++) {
      const s = randomString(i % 70);
      expect(utf8(s)).toEqual([...Buffer.from(s, "utf8")]);
    }
  });
});

describe("sha1Hex / sha256Hex", () => {
  it("match node:crypto on every length 0..300 (padding boundaries)", () => {
    for (let n = 0; n <= 300; n++) {
      const b = randomBytes(n);
      expect(sha1Hex(b)).toBe(createHash("sha1").update(b).digest("hex"));
      expect(sha256Hex(b)).toBe(createHash("sha256").update(b).digest("hex"));
    }
  });
  it("match node:crypto on 1,000 random multibyte strings", () => {
    for (let i = 0; i < 1000; i++) {
      const s = randomString(1 + (i % 150));
      expect(sha1Hex(utf8(s))).toBe(createHash("sha1").update(s, "utf8").digest("hex"));
      expect(sha256Hex(utf8(s))).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
  it("match node:crypto on a 1 MiB input", () => {
    const b = randomBytes(1 << 20);
    expect(sha256Hex(b)).toBe(createHash("sha256").update(b).digest("hex"));
    expect(sha1Hex(b)).toBe(createHash("sha1").update(b).digest("hex"));
  });
  it("known answers (FIPS 180-4 examples)", () => {
    expect(sha1Hex(utf8("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(sha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("bucket and hashConfidential", () => {
  it("bucket equals the node:crypto formula for random seeds and values", () => {
    for (let i = 0; i < 1000; i++) {
      const seed = randomString(i % 20);
      const v = randomString(1 + (i % 40));
      const want = parseInt(createHash("sha1").update(seed + v, "utf8").digest("hex").slice(0, 7), 16) % 100;
      expect(bucket(seed, v)).toBe(want);
    }
  });
  it("hashConfidential equals sha256(utf8(value) + utf8(salt + context)), sliced by UTF-8 bytes", () => {
    for (let i = 0; i < 300; i++) {
      const v = randomString(1 + (i % 30));
      const salt = randomString(i % 10);
      const ctx = randomString(i % 12);
      const full = createHash("sha256").update(Buffer.concat([Buffer.from(v, "utf8"), Buffer.from(salt + ctx, "utf8")])).digest("hex");
      expect(hashConfidential(v, salt, ctx)).toBe(full);
      const bytes = Buffer.from(v, "utf8");
      const n = 1 + (i % bytes.length);
      const start = createHash("sha256").update(Buffer.concat([bytes.subarray(0, n), Buffer.from(salt + ctx, "utf8")])).digest("hex");
      const end = createHash("sha256").update(Buffer.concat([bytes.subarray(bytes.length - n), Buffer.from(salt + ctx, "utf8")])).digest("hex");
      expect(hashConfidential(v, salt, ctx, { from: "start", bytes: n })).toBe(`${n}_${start}`);
      expect(hashConfidential(v, salt, ctx, { from: "end", bytes: n })).toBe(`${n}_${end}`);
    }
  });
});

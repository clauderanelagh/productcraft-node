// Pure-TS SHA-1 and SHA-256 (FIPS 180-4) over UTF-8 bytes, so evaluation
// stays synchronous on every runtime (Web Crypto is async, node:crypto is
// missing on some edges). Tested against node:crypto in tests/hash.test.ts.

/** UTF-8 bytes of a JS string. A lone surrogate becomes U+FFFD, as TextEncoder and Buffer do. */
export function utf8(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) {
      const d = s.charCodeAt(i + 1);
      if (c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      } else c = 0xfffd;
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Pads a message into big-endian 32-bit words (both hashes share the padding). */
function words(bytes: ArrayLike<number>): number[] {
  const n = bytes.length;
  const w: number[] = new Array(((n + 8) >> 6) * 16 + 16).fill(0);
  for (let i = 0; i < n; i++) w[i >> 2]! |= (bytes[i]! & 255) << (24 - (i & 3) * 8);
  w[n >> 2]! |= 0x80 << (24 - (n & 3) * 8);
  const total = (((n + 8) >> 6) + 1) * 16;
  w.length = total;
  w[total - 1] = (n * 8) >>> 0;
  w[total - 2] = Math.floor(n / 0x20000000);
  return w;
}

const hex = (h: number[]): string => h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));

export function sha1Hex(bytes: ArrayLike<number>): string {
  const m = words(bytes);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array<number>(80);
  for (let i = 0; i < m.length; i += 16) {
    for (let t = 0; t < 80; t++) w[t] = t < 16 ? m[i + t]! : rotl(w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!, 1);
    let [a, b, c, d, e] = h as [number, number, number, number, number];
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 || t >= 60 ? b ^ c ^ d : (b & c) | (b & d) | (c & d);
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const tmp = (rotl(a, 5) + f + e + k + w[t]!) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = tmp;
    }
    h[0] = (h[0]! + a) | 0;
    h[1] = (h[1]! + b) | 0;
    h[2] = (h[2]! + c) | 0;
    h[3] = (h[3]! + d) | 0;
    h[4] = (h[4]! + e) | 0;
  }
  return hex(h);
}

/** floor(n^(1/k)), exactly (BigInt binary search). */
function iroot(n: bigint, k: bigint): bigint {
  let lo = 0n;
  let hi = 1n << 48n;
  while (lo < hi) {
    const m = (lo + hi + 1n) >> 1n;
    if (m ** k <= n) lo = m;
    else hi = m - 1n;
  }
  return lo;
}

/** The first 32 bits of the fractional part of the k-th root of each of the first `count` primes (FIPS 180-4 4.2.2, 5.3.3). */
function constants(count: number, k: bigint): number[] {
  const out: number[] = [];
  for (let n = 2; out.length < count; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
    if (prime) out.push(Number(iroot(BigInt(n) << (32n * k), k) & 0xffffffffn) | 0);
  }
  return out;
}

let K: number[] | undefined;
let H: number[] | undefined;

export function sha256Hex(bytes: ArrayLike<number>): string {
  K ??= constants(64, 3n);
  H ??= constants(8, 2n);
  const m = words(bytes);
  const h = H.slice();
  const w = new Array<number>(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < m.length; i += 16) {
    for (let t = 0; t < 64; t++) {
      if (t < 16) w[t] = m[i + t]!;
      else {
        const a = w[t - 15]!;
        const b = w[t - 2]!;
        w[t] = ((rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[t - 7]! + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) + w[t - 16]!) | 0;
      }
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K![t]! + w[t]!) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    const v = [a, b, c, d, e, f, g, hh];
    for (let j = 0; j < 8; j++) h[j] = (h[j]! + v[j]!) | 0;
  }
  return hex(h);
}

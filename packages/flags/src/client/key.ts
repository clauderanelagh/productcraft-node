// SDK key shape and checksum (design 6.1): `pcf_sdk_` + 32 base62 + 6-char base62 CRC-32 of the body.
// A typo fails here, before any request; the checksum is public, so it is a typo check, not a secret.

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i);
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function base62(value: number, width: number): string {
  let out = "";
  do {
    out = BASE62[value % 62] + out;
    value = Math.floor(value / 62);
  } while (value > 0);
  return out.padStart(width, "0");
}

/** True when `key` has the SDK key shape and its checksum matches. */
export function isWellFormedSdkKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^pcf_sdk_[0-9A-Za-z]{38}$/.test(key)) return false;
  return base62(crc32(key.slice(8, 40)), 6) === key.slice(40);
}

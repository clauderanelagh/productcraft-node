/**
 * Passkey (WebAuthn) helpers — the encoding layer and the browser bridge.
 *
 * WebAuthn speaks ArrayBuffer; the Auth API speaks JSON. Every buffer
 * crossing the wire is **base64url** (`-` `_`, no `=` padding), and
 * getting the alphabet or the padding wrong produces a signature
 * failure rather than a parse error. These four functions are a
 * straight port of section 2 of the passkeys guide, exported for
 * customers who want the pieces; `consumer(slug).passkeys.*` composes
 * them into one call per ceremony.
 *
 * Nothing in this module touches `navigator`, `window` or any other
 * browser global at import time — the package must load cleanly in a
 * Node process (BFFs verify tokens with it). Browser globals are read
 * lazily, inside the functions that need them.
 *
 * Wire shape: snake_case everywhere EXCEPT the members of
 * `credential.response` (`clientDataJSON`, `attestationObject`,
 * `authenticatorData`, `signature`, `userHandle`). Those names are
 * fixed by the WebAuthn spec and travel verbatim — they are not ours
 * to rename.
 */

// ─────────────────────────────────────────────────────────────
// Encoding layer (ported from the guide — do not re-derive)
// ─────────────────────────────────────────────────────────────

/** ArrayBuffer / typed array → base64url string (no `+`, `/` or `=`). */
export function toB64u(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  // Same result as `String.fromCharCode(...bytes)` without the
  // spread-argument limit for multi-kilobyte attestation objects.
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url string → bytes. Tolerates missing padding. */
export function fromB64u(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * The `public_key` object Auth returns from an options call, with
 * every buffer base64url-encoded. Mirrors
 * `PublicKeyCredentialCreationOptions` / `PublicKeyCredentialRequestOptions`
 * from the WebAuthn spec, minus the ArrayBuffers.
 */
export interface PasskeyPublicKeyOptions {
  challenge: string;
  user?: { id: string; [k: string]: unknown };
  excludeCredentials?: Array<{ id: string; [k: string]: unknown }>;
  allowCredentials?: Array<{ id: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

const snakeToCamel = (k: string): string =>
  k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Deep-rename snake_case keys to camelCase; values (including string
 * values like `"public-key"`) are never touched. The Auth API's global
 * wire convention decamelizes every response key, `public_key`'s
 * members included, but `navigator.credentials` only understands the
 * WebAuthn spec's camelCase names (`rpId`, `pubKeyCredParams`,
 * `authenticatorSelection`, `allowCredentials`, …). Idempotent on
 * input that is already camelCase.
 */
function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[snakeToCamel(k)] = camelizeKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * Auth returns `public_key` with every buffer base64url-encoded;
 * `navigator.credentials` wants real ArrayBuffers. Decodes
 * `challenge`, `user.id`, and the `id` of every entry in
 * `excludeCredentials` / `allowCredentials`; everything else passes
 * through with its value untouched.
 *
 * Accepts the member names either as the WebAuthn spec writes them
 * (`rpId`, `pubKeyCredParams`) or as the Auth wire convention
 * decamelizes them (`rp_id`, `pub_key_cred_params`) and always emits
 * the spec's camelCase, which is the only shape the browser accepts.
 */
export function decodeOptions<T extends PasskeyPublicKeyOptions>(
  publicKey: T,
): Omit<T, "challenge" | "user" | "excludeCredentials" | "allowCredentials"> & {
  challenge: Uint8Array;
  user?: Omit<NonNullable<T["user"]>, "id"> & { id: Uint8Array };
  excludeCredentials?: Array<{ id: Uint8Array; [k: string]: unknown }>;
  allowCredentials?: Array<{ id: Uint8Array; [k: string]: unknown }>;
} {
  const pk = camelizeKeys(publicKey) as PasskeyPublicKeyOptions;
  const out: Record<string, unknown> = {
    ...pk,
    challenge: fromB64u(pk.challenge),
  };
  if (pk.user) {
    out.user = { ...pk.user, id: fromB64u(pk.user.id) };
  }
  for (const list of ["excludeCredentials", "allowCredentials"] as const) {
    const entries = pk[list];
    if (entries) {
      out[list] = entries.map((c) => ({ ...c, id: fromB64u(c.id) }));
    }
  }
  return out as ReturnType<typeof decodeOptions<T>>;
}

/**
 * Structural shape of a `PublicKeyCredential` — the DOM type without
 * needing the DOM lib. A real `PublicKeyCredential` (from
 * `navigator.credentials.create()` / `.get()`) satisfies it.
 */
export interface PasskeyCredentialLike {
  id: string;
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject?: ArrayBuffer;
    authenticatorData?: ArrayBuffer;
    signature?: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
  };
}

/**
 * The `credential` object every verify endpoint accepts. `response`
 * members keep their WebAuthn names verbatim.
 */
export interface EncodedPasskeyCredential {
  id: string;
  response: {
    clientDataJSON: string;
    attestationObject?: string;
    authenticatorData?: string;
    signature?: string;
    userHandle?: string;
  };
}

/**
 * …and the reverse, for the credential you send back. Only the
 * members present on the response are emitted: an attestation
 * (enrol) carries `attestationObject`; an assertion (sign-in /
 * step-up) carries `authenticatorData` + `signature` (+ `userHandle`
 * when the authenticator supplies one).
 */
export function encodeCredential(
  cred: PasskeyCredentialLike,
): EncodedPasskeyCredential {
  const r = cred.response;
  const response: EncodedPasskeyCredential["response"] = {
    clientDataJSON: toB64u(r.clientDataJSON),
  };
  if (r.attestationObject) response.attestationObject = toB64u(r.attestationObject);
  if (r.authenticatorData) response.authenticatorData = toB64u(r.authenticatorData);
  if (r.signature) response.signature = toB64u(r.signature);
  if (r.userHandle) response.userHandle = toB64u(r.userHandle);
  return { id: cred.id, response };
}

// ─────────────────────────────────────────────────────────────
// Browser bridge — reads globals lazily, never at import time
// ─────────────────────────────────────────────────────────────

/**
 * Minimal view of `navigator.credentials`, typed structurally so the
 * package compiles without the DOM lib and so tests can inject a
 * stand-in.
 */
export interface PasskeyCredentialsContainer {
  create(options: {
    publicKey: unknown;
    signal?: AbortSignal;
  }): Promise<PasskeyCredentialLike | null>;
  get(options: {
    publicKey: unknown;
    mediation?: PasskeyMediation;
    signal?: AbortSignal;
  }): Promise<PasskeyCredentialLike | null>;
}

/** `CredentialMediationRequirement` from the Credential Management spec. */
export type PasskeyMediation = "silent" | "optional" | "conditional" | "required";

export type PasskeyErrorCode =
  /** No WebAuthn in this environment — see {@link isPasskeySupported}. */
  | "unsupported"
  /** The user dismissed the prompt, timed out, or no passkey matched (`NotAllowedError`). */
  | "cancelled"
  /** The authenticator refused (e.g. credential already registered — `InvalidStateError`). */
  | "invalid_state"
  /** The page origin does not match the app's `rp_id` (`SecurityError`). */
  | "security"
  /** The browser returned no credential without throwing. */
  | "no_credential"
  /** Any other `navigator.credentials` failure; `cause` carries the original. */
  | "unknown";

/**
 * Thrown by the ceremony helpers when the *browser* side fails. HTTP
 * failures from Auth keep surfacing as `AuthHttpError` so a caller can
 * tell "the user cancelled" from "the server said 401".
 */
export class PasskeyError extends Error {
  public readonly code: PasskeyErrorCode;
  public override readonly cause?: unknown;

  constructor(code: PasskeyErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PasskeyError";
    this.code = code;
    this.cause = cause;
  }
}

function browserCredentials(): PasskeyCredentialsContainer | undefined {
  const nav = (globalThis as { navigator?: { credentials?: unknown } }).navigator;
  const creds = nav?.credentials as PasskeyCredentialsContainer | undefined;
  if (!creds || typeof creds.create !== "function" || typeof creds.get !== "function") {
    return undefined;
  }
  return creds;
}

/**
 * `true` when this environment can run a passkey ceremony: a
 * `window` with `PublicKeyCredential`, `navigator.credentials.create`
 * / `.get`, and a secure context (https, or http on localhost).
 * Always `false` in Node — use it to hide the button rather than
 * showing one that throws. Never throws itself.
 */
export function isPasskeySupported(): boolean {
  const g = globalThis as {
    window?: unknown;
    PublicKeyCredential?: unknown;
    isSecureContext?: boolean;
  };
  if (typeof g.window === "undefined") return false;
  if (typeof g.PublicKeyCredential !== "function") return false;
  if (g.isSecureContext === false) return false;
  return browserCredentials() !== undefined;
}

function mapDomError(err: unknown): PasskeyError {
  const name = (err as { name?: string } | null)?.name;
  const message = (err as { message?: string } | null)?.message ?? String(err);
  switch (name) {
    case "NotAllowedError":
      return new PasskeyError(
        "cancelled",
        `Passkey prompt was cancelled, timed out, or no passkey matched: ${message}`,
        err,
      );
    case "InvalidStateError":
      return new PasskeyError("invalid_state", `Authenticator refused: ${message}`, err);
    case "SecurityError":
      return new PasskeyError(
        "security",
        `Page origin does not match the app's rp_id: ${message}`,
        err,
      );
    case "AbortError":
      return new PasskeyError("cancelled", `Passkey ceremony aborted: ${message}`, err);
    default:
      return new PasskeyError("unknown", `navigator.credentials failed: ${message}`, err);
  }
}

export interface PasskeyBrowserOptions {
  /** Abort the browser prompt (e.g. on route change). */
  signal?: AbortSignal;
  /**
   * Override `navigator.credentials` — for tests, or non-browser
   * runtimes that expose a compatible container. Defaults to the
   * global one, read at call time.
   */
  credentials?: PasskeyCredentialsContainer;
}

/**
 * `navigator.credentials.create()` with base64url handled: takes the
 * `public_key` from an Auth enrolment response, returns the encoded
 * `credential` to POST back. Throws {@link PasskeyError}.
 */
export async function createPasskeyCredential(
  publicKey: PasskeyPublicKeyOptions,
  opts: PasskeyBrowserOptions = {},
): Promise<EncodedPasskeyCredential> {
  const creds = opts.credentials ?? browserCredentials();
  if (!creds) {
    throw new PasskeyError(
      "unsupported",
      "navigator.credentials is not available — passkeys need a browser with WebAuthn (check isPasskeySupported())",
    );
  }
  let cred: PasskeyCredentialLike | null;
  try {
    cred = await creds.create({ publicKey: decodeOptions(publicKey), signal: opts.signal });
  } catch (err) {
    throw mapDomError(err);
  }
  if (!cred) {
    throw new PasskeyError("no_credential", "navigator.credentials.create() returned null");
  }
  return encodeCredential(cred);
}

/**
 * `navigator.credentials.get()` with base64url handled: takes the
 * `public_key` from an Auth options response, returns the encoded
 * `credential` to POST back. Throws {@link PasskeyError}.
 */
export async function getPasskeyCredential(
  publicKey: PasskeyPublicKeyOptions,
  opts: PasskeyBrowserOptions & { mediation?: PasskeyMediation } = {},
): Promise<EncodedPasskeyCredential> {
  const creds = opts.credentials ?? browserCredentials();
  if (!creds) {
    throw new PasskeyError(
      "unsupported",
      "navigator.credentials is not available — passkeys need a browser with WebAuthn (check isPasskeySupported())",
    );
  }
  let cred: PasskeyCredentialLike | null;
  try {
    cred = await creds.get({
      publicKey: decodeOptions(publicKey),
      mediation: opts.mediation,
      signal: opts.signal,
    });
  } catch (err) {
    throw mapDomError(err);
  }
  if (!cred) {
    throw new PasskeyError("no_credential", "navigator.credentials.get() returned null");
  }
  return encodeCredential(cred);
}

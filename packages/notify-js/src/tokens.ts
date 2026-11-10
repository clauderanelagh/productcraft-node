import { AuthenticationError } from "@productcraft/notify";
import { NotifyClientError } from "./errors.js";

/** The codes on which a call fetches a fresh token and retries once (a revoked token reads as invalid). */
export const isTokenError = (e: unknown): boolean =>
  e instanceof AuthenticationError && (e.code === "RECIPIENT_TOKEN_EXPIRED" || e.code === "RECIPIENT_TOKEN_INVALID");

/**
 * Holds the recipient token in memory only (never Web Storage, never a URL; design 4.1, S9)
 * and dedupes refreshes: every caller that sees the same stale token shares one `getToken()`.
 */
export class TokenManager {
  #token: string | undefined;
  #pending: Promise<string> | undefined;
  constructor(private readonly getToken: () => string | Promise<string>) {}

  /** The current token, fetching one on first use. */
  get(): Promise<string> {
    return this.#token !== undefined ? Promise.resolve(this.#token) : this.refresh();
  }

  /** A new token. `stale` is the token that failed: when another caller already replaced it, that one is returned. */
  refresh(stale?: string): Promise<string> {
    if (stale !== undefined && this.#token !== undefined && this.#token !== stale) return Promise.resolve(this.#token);
    return (this.#pending ??= (async () => {
      try {
        const t = await this.getToken();
        if (typeof t !== "string" || t.trim() === "") throw new NotifyClientError("TOKEN_INVALID", "getToken() must resolve to the recipient token your backend minted.");
        if (t.startsWith("pcft_")) throw new NotifyClientError("TOKEN_INVALID", "getToken() returned a workspace API key. Mint a recipient token on your backend; never ship an API key to a browser or an app.");
        return (this.#token = t.trim());
      } finally {
        this.#pending = undefined;
      }
    })());
  }

  clear(): void {
    this.#token = undefined;
  }
}

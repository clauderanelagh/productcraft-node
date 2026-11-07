/**
 * `productcraft`: every ProductCraft product from one import, one key and one shared config.
 * Each product is the same class its own package exports, built on first access.
 * @example
 * ```ts
 * import { ProductCraft } from "productcraft";
 * const pc = new ProductCraft({ apiKey: process.env.PRODUCTCRAFT_API_KEY, maxRetries: 3 });
 * for await (const job of pc.trawl.jobs.list()) console.log(job.id, job.status);
 * ```
 */
import { Auth, type AuthOptions } from "@productcraft/auth";
import { Mail } from "@productcraft/mail";
import { PlatformAuth } from "@productcraft/platform-auth";
import { Social } from "@productcraft/social";
import { Trawl } from "@productcraft/trawl";
import { Waitlist } from "@productcraft/waitlist";
import { PC_WORKSPACE_ID_ENV, readEnv, type ClientOptions } from "@productcraft/core";

export { Auth, Mail, PlatformAuth, Social, Trawl, Waitlist };
export type { AuthErrorCode, AuthOptions } from "@productcraft/auth"; export type { MailErrorCode } from "@productcraft/mail";
export type { PlatformAuthErrorCode } from "@productcraft/platform-auth"; export type { SocialErrorCode } from "@productcraft/social";
export type { TrawlErrorCode } from "@productcraft/trawl"; export type { WaitlistErrorCode } from "@productcraft/waitlist";
export { APIConnectionError, APIError, APITimeoutError, APIUserAbortError, AuthenticationError, BadRequestError, ConfigurationError, ConflictError, IdempotencyKeyReuseError, InternalServerError, NotFoundError, PermissionDeniedError, ProductCraftError, RateLimitError, UnprocessableEntityError, WebhookVerificationError } from "@productcraft/core";
export { PC_BASE_URL, signWebhook, verifyWebhook, type APIPromise, type ClientOptions, type Logger, type LogLevel, type Page, type PagePromise, type PCAuth, type PCClientConfig, type RequestOptions, type SignedWebhook, type SignWebhookParams, type VerifyWebhookParams } from "@productcraft/core";

/** Per-product settings merged over the shared ones. Nested because a flat `auth` key would collide with the credential field. */
export interface ProductCraftOverrides {
  auth?: AuthOptions; mail?: ClientOptions; waitlist?: ClientOptions; social?: ClientOptions; trawl?: ClientOptions; platform?: ClientOptions;
  /** Same as `platform` (its 0.x name); `platform` wins where both set a field. */
  platformAuth?: ClientOptions;
}

/** Shared config for every product (`apiKey` or `auth`, `workspaceId`, retries, timeout, fetch, logging), plus `overrides`. */
export interface ProductCraftOptions extends AuthOptions { overrides?: ProductCraftOverrides }
const PRODUCTS = { auth: Auth, mail: Mail, waitlist: Waitlist, social: Social, trawl: Trawl, platform: PlatformAuth };
type Products = { [K in keyof typeof PRODUCTS]: InstanceType<(typeof PRODUCTS)[K]> };

export class ProductCraft {
  readonly #shared: AuthOptions; readonly #overrides: ProductCraftOverrides;
  readonly #built: Partial<Products> = {};
  constructor(options: ProductCraftOptions = {}) {
    const { overrides = {}, ...shared } = options;
    // Read once, so every product (and the one cached key lookup when it is absent) agrees on the workspace.
    this.#shared = { ...shared, workspaceId: shared.workspaceId ?? readEnv(PC_WORKSPACE_ID_ENV) };
    this.#overrides = overrides;
  }
  #get<K extends keyof Products>(name: K): Products[K] {
    const own = name === "platform" ? { ...this.#overrides.platformAuth, ...this.#overrides.platform } : this.#overrides[name];
    const Ctor = PRODUCTS[name] as unknown as new (options: AuthOptions) => Products[K];
    return (this.#built[name] ??= new Ctor({ ...this.#shared, ...own }));
  }
  get auth(): Auth { return this.#get("auth"); }
  get mail(): Mail { return this.#get("mail"); }
  get waitlist(): Waitlist { return this.#get("waitlist"); }
  get social(): Social { return this.#get("social"); }
  get trawl(): Trawl { return this.#get("trawl"); }
  get platform(): PlatformAuth { return this.#get("platform"); }
  /** Same instance as `platform` (its 0.x name). */
  get platformAuth(): PlatformAuth { return this.#get("platform"); }
}

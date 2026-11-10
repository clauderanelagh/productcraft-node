/**
 * ProductCraftFlagsProvider: an OpenFeature server provider over `FlagsClient` (design 8.3).
 *
 * Evaluation stays local: the provider maps the OpenFeature evaluation context to a Flags user and asks
 * `FlagsClient`, which evaluates the downloaded config in this process. Reasons, variants and error codes
 * map onto OpenFeature's; `PREREQUISITE_*` errors become `GENERAL`.
 */
import {
  ErrorCode,
  OpenFeatureEventEmitter,
  ProviderEvents,
  type EvaluationContext,
  type EvaluationContextValue,
  type FlagMetadata,
  type JsonValue,
  type Logger as OpenFeatureLogger,
  type Provider,
  type ProviderMetadata,
  type ResolutionDetails,
  type ResolutionReason,
} from "@openfeature/server-sdk";
import {
  FlagsClient,
  type EvaluationDetails,
  type FlagsClientOptions,
  type User,
  type UserAttributeValue,
} from "@productcraft/flags";

/** Where the provider logs download failures it reports as events. `console` by default; `null` logs nothing. */
export interface ProviderLogger {
  warn(...args: unknown[]): void;
}

export type ProductCraftFlagsProviderOptions =
  /** Use your own client (it is closed when the provider closes). */
  | { client: FlagsClient; logger?: ProviderLogger | null }
  /** Or let the provider create one from `FlagsClient` options. */
  | FlagsClientOptions;

type Obj = Record<string, unknown>;

/** Engine and client error codes to OpenFeature's; anything else (`PREREQUISITE_*`) is GENERAL. */
const ERROR_CODES: Record<string, ErrorCode> = {
  FLAG_NOT_FOUND: ErrorCode.FLAG_NOT_FOUND,
  TYPE_MISMATCH: ErrorCode.TYPE_MISMATCH,
  PARSE_ERROR: ErrorCode.PARSE_ERROR,
  PROVIDER_NOT_READY: ErrorCode.PROVIDER_NOT_READY,
};

/** Download failures; the rest (`evaluation`, `listener`, `cache`, `overrides`) change no provider status. */
const DOWNLOAD_ERRORS = new Set([
  "network",
  "http_status",
  "too_large",
  "PARSE_ERROR",
  "UNSUPPORTED_SCHEMA",
  "key_invalid",
  "rate_limited",
]);

/** Stands in for an object default, so FlagsClient parses json settings and reports any other type as TYPE_MISMATCH. */
const OBJECT_DEFAULT: Readonly<Obj> = Object.freeze({});

/**
 * ProductCraft Flags as an OpenFeature provider.
 *
 * @example
 * ```ts
 * import { OpenFeature } from "@openfeature/server-sdk";
 * import { ProductCraftFlagsProvider } from "@productcraft/flags-openfeature";
 *
 * await OpenFeature.setProviderAndWait(new ProductCraftFlagsProvider({ sdkKey: process.env.PRODUCTCRAFT_FLAGS_SDK_KEY }));
 * const client = OpenFeature.getClient();
 * const on = await client.getBooleanValue("new_checkout", false, { targetingKey: user.id, plan: "pro" });
 * ```
 */
export class ProductCraftFlagsProvider implements Provider {
  readonly metadata: ProviderMetadata = { name: "productcraft-flags" };
  readonly runsOn = "server" as const;
  readonly events = new OpenFeatureEventEmitter();
  /** The `FlagsClient` underneath: for `snapshot()`, `forceRefresh()`, `getAllValues()` and its own events. */
  readonly client: FlagsClient;
  readonly #log: ProviderLogger | null;
  readonly #unsubscribe: Array<() => void>;
  /** The status this provider last reported; events fire on changes only. */
  #status: "initializing" | "ready" | "stale" | "error" = "initializing";
  #settings: Obj | null;

  constructor(options: ProductCraftFlagsProviderOptions) {
    // Duck-typed: an ESM FlagsClient and a CJS one are different classes.
    const own = !("client" in options && options.client);
    this.client = own
      ? new FlagsClient(options as FlagsClientOptions)
      : (options as { client: FlagsClient }).client;
    const logger = (options as { logger?: ProviderLogger | null }).logger;
    this.#log = logger === null ? null : (logger ?? console);
    this.#settings = this.#currentSettings();
    this.#unsubscribe = [
      this.client.on("configChanged", () => this.#configChanged()),
      this.client.on("error", (e) => this.#clientError(e)),
    ];
  }

  /** Waits for the first download (at most `maxInitWaitSeconds`). Rejects when no config is available at all. */
  async initialize(): Promise<void> {
    const state = await this.client.waitForReady();
    if (this.client.snapshot().toJSON() === null) {
      this.#status = "error";
      throw new Error(
        `[productcraft/flags] no config available (client state: ${state})`,
      );
    }
    this.#status = "ready";
  }

  /** Closes the client: stops polling and timers. */
  async onClose(): Promise<void> {
    for (const off of this.#unsubscribe) off();
    this.client.close();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: OpenFeatureLogger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.#resolve(flagKey, defaultValue, context, logger);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: OpenFeatureLogger,
  ): Promise<ResolutionDetails<string>> {
    return this.#resolve(flagKey, defaultValue, context, logger);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: OpenFeatureLogger,
  ): Promise<ResolutionDetails<number>> {
    return this.#resolve(flagKey, defaultValue, context, logger);
  }

  /** Json settings, parsed. Any other setting type is TYPE_MISMATCH. */
  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: OpenFeatureLogger,
  ): Promise<ResolutionDetails<T>> {
    const r = await this.#resolve<unknown>(
      flagKey,
      OBJECT_DEFAULT,
      context,
      logger,
    );
    return {
      ...r,
      value: (r.value === OBJECT_DEFAULT ? defaultValue : r.value) as T,
    };
  }

  async #resolve<T>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: OpenFeatureLogger,
  ): Promise<ResolutionDetails<T>> {
    const d = (await this.client.getValueDetails(
      flagKey,
      defaultValue as never,
      toUser(context, logger),
    )) as EvaluationDetails<T>;
    this.#recovered();
    return toResolution(d);
  }

  #configChanged(): void {
    const before = this.#settings;
    const after = (this.#settings = this.#currentSettings());
    this.#recovered();
    if (this.#status === "initializing") return;
    this.events.emit(ProviderEvents.ConfigurationChanged, {
      flagsChanged: changedKeys(before, after),
      metadata: { revision: this.client.snapshot().revision },
    });
  }

  #clientError(e: Error & { code?: string }): void {
    if (!DOWNLOAD_ERRORS.has(e.code ?? "")) return;
    try {
      this.#log?.warn(`[productcraft/flags] ${e.message}`);
    } catch {
      /* a broken logger never breaks the provider */
    }
    if (this.#status === "initializing") return;
    const next =
      e.code === "key_invalid" || this.client.snapshot().toJSON() === null
        ? "error"
        : "stale";
    if (next === this.#status) return;
    this.#status = next;
    if (next === "error")
      this.events.emit(ProviderEvents.Error, {
        message: e.message,
        errorCode: ErrorCode.GENERAL,
      });
    else this.events.emit(ProviderEvents.Stale, { message: e.message });
  }

  /** After STALE or ERROR, the first successful download (or new config) reports READY again. */
  #recovered(): void {
    if (
      (this.#status === "stale" || this.#status === "error") &&
      this.client.state === "ready" &&
      this.client.snapshot().toJSON() !== null
    ) {
      this.#status = "ready";
      this.events.emit(ProviderEvents.Ready);
    }
  }

  #currentSettings(): Obj | null {
    const raw = this.client.snapshot().toJSON() as Obj | null;
    return raw
      ? ({
          settings: raw.settings,
          segments: raw.segments,
          salt: raw.salt,
        } as Obj)
      : null;
  }
}

/** Keys whose setting changed; every key when segments or the salt changed (any rule may depend on them). */
function changedKeys(before: Obj | null, after: Obj | null): string[] {
  const b = (before?.settings ?? {}) as Obj;
  const a = (after?.settings ?? {}) as Obj;
  const all = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const shared =
    JSON.stringify(before?.segments ?? null) ===
      JSON.stringify(after?.segments ?? null) && before?.salt === after?.salt;
  return shared
    ? all.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    : all;
}

/** OpenFeature's context to a Flags user: `targetingKey` is the identifier; primitives, Dates and string arrays are attributes. */
export function toUser(
  context: EvaluationContext,
  logger?: OpenFeatureLogger,
): User | undefined {
  const custom = Object.create(null) as Record<string, UserAttributeValue>;
  const user: User = { custom };
  let any = false;
  for (const key of Object.keys(context)) {
    if (key === "targetingKey") continue;
    const value = attribute(context[key]);
    if (value === undefined) {
      if (context[key] !== null && context[key] !== undefined)
        logger?.debug(
          `[productcraft/flags] context attribute ${JSON.stringify(key)} dropped: not a string, number, boolean, Date or string[]`,
        );
      continue;
    }
    any = true;
    // The engine reads these three from the top level (and coerces a number identifier to text).
    if (key === "identifier" || key === "email" || key === "country")
      (user as Obj)[key] = value;
    else custom[key] = value;
  }
  if (typeof context.targetingKey === "string" && context.targetingKey !== "") {
    user.identifier = context.targetingKey;
    any = true;
  }
  // An empty context leaves the client's default user in place.
  return any ? user : undefined;
}

function attribute(
  v: EvaluationContextValue | undefined,
): UserAttributeValue | undefined {
  if (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean" ||
    v instanceof Date
  )
    return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string"))
    return v as string[];
  return undefined;
}

/** FlagsClient's evaluation details to OpenFeature's resolution. */
export function toResolution<T>(d: EvaluationDetails<T>): ResolutionDetails<T> {
  const flagMetadata: FlagMetadata = { revision: d.revision };
  if (d.ruleIndex !== null) flagMetadata.rule_index = d.ruleIndex;
  if (d.percentageIndex !== null)
    flagMetadata.percentage_index = d.percentageIndex;
  const out: ResolutionDetails<T> = {
    value: d.value,
    reason: d.reason as ResolutionReason,
    flagMetadata,
  };
  if (d.variant !== null) out.variant = d.variant;
  if (d.reason === "ERROR" || d.errorCode !== null) {
    out.reason = "ERROR";
    out.errorCode = ERROR_CODES[d.errorCode ?? ""] ?? ErrorCode.GENERAL;
    if (d.errorMessage) out.errorMessage = d.errorMessage;
  }
  return out;
}

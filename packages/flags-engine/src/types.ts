/** The five setting types of config JSON schema 1. `integer` is a safe integer (int53); `json` values are JSON text. */
export type SettingType = "boolean" | "string" | "integer" | "number" | "json";

/** A served value: `json` settings serve their JSON text as a string. */
export type SettingValue = boolean | string | number;

/** A value a user attribute may hold. Anything else is an invalid attribute (a soft miss). */
export type UserAttributeValue = string | number | boolean | Date | readonly string[] | null | undefined;

/**
 * The user an evaluation is for. `identifier`, `email` and `country` are read from the top level;
 * any other attribute `a` is read from `custom[a]` when present, else from the top-level `a`.
 * Only own properties are read. The object never leaves the process.
 */
export interface User {
  identifier?: string;
  email?: string;
  country?: string;
  custom?: { [attribute: string]: UserAttributeValue };
  [attribute: string]: unknown;
}

/** Why an evaluation returned its value. */
export type Reason = "STATIC" | "TARGETING_MATCH" | "SPLIT" | "DEFAULT" | "ERROR" | "CACHED" | "STALE";

/** Stable error codes. The engine produces the first six; the client layer adds the rest. */
export type ErrorCode =
  | "FLAG_NOT_FOUND"
  | "TYPE_MISMATCH"
  | "PREREQUISITE_CYCLE"
  | "PREREQUISITE_NOT_FOUND"
  | "PREREQUISITE_DEPTH"
  | "GENERAL"
  | "PARSE_ERROR"
  | "PROVIDER_NOT_READY";

/** Soft-miss warnings: the condition (or split) could not be evaluated for this user, and evaluation went on. */
export type WarningCode =
  | "missing_user"
  | "missing_attribute"
  | "invalid_attribute"
  | "unknown_comparator"
  | "missing_percentage_attribute";

export interface Warning {
  code: WarningCode;
  message: string;
  /** The setting being evaluated when the warning was recorded (a prerequisite's key for its own warnings). */
  key: string;
  ruleIndex: number | null;
  attribute: string | null;
}

/** The result of one evaluation (design 7.5). */
export interface EvaluationDetails<T = SettingValue | null> {
  key: string;
  value: T;
  /** `rule:i`, `rule:i/pct:j`, `pct:j` or `default` (the setting's own value); null on ERROR. */
  variant: string | null;
  reason: Reason;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
  ruleIndex: number | null;
  percentageIndex: number | null;
  /** True only when the caller's default was returned (reason ERROR). */
  isDefaultValue: boolean;
  revision: number;
  warnings: Warning[];
}

/** The value type `evaluate` returns for a given default. */
export type ValueFor<D> = D extends boolean
  ? boolean
  : D extends string
    ? string
    : D extends number
      ? number
      : SettingValue | D;

/** The revision identity of a config, as carried by the body and the `X-PC-Config-*` headers. */
export interface ConfigVersion {
  revision: number;
  generation: number;
}

export interface ParsedConfig extends ConfigVersion {
  readonly schema: 1;
  readonly revision: number;
  /** Bumped only after a database restore; a new generation resets the revision guard. */
  readonly generation: number;
  readonly publishedAt: string | null;
  readonly configId: string | null;
  readonly environmentId: string | null;
  readonly salt: string;
  /** `delivery` as sent: a hint. The client keeps only `https://*.productcraft.co` origins. */
  readonly delivery: { readonly baseUrls: readonly string[]; readonly mode: string } | null;
  /** Setting keys in config order. */
  keys(): string[];
  /** The type of a setting, or undefined when the config has no such key. */
  settingType(key: string): SettingType | undefined;
}

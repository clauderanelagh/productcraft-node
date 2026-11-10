/**
 * @productcraft/flags: feature flags and remote settings.
 *
 * - `FlagsClient` (hand-written, src/client/): downloads one config per environment and evaluates
 *   flags locally with @productcraft/flags-engine, so user attributes never leave your app.
 * - `Flags`: the management API client, generated from the Flags OpenAPI document (scripts/gen-sdk.mjs).
 */
export { Flags } from "./_generated/client.js";
export * from "./_generated/errors.js";
export type * from "./_generated/runtime.js";
export type { paths, components } from "./_generated/paths.js";
export { Flags as default } from "./_generated/client.js";
export { FlagsClient, FlagsClientError, FlagsSnapshot, MAX_CONFIG_BYTES } from "./client/client.js";
export type {
  AutoPolling,
  ClientState,
  ConfigChangedEvent,
  ConfigSource,
  FlagsCache,
  FlagsClientErrorCode,
  FlagsClientEvents,
  FlagsClientOptions,
  FlagsOverrides,
  FlagValue,
  LazyPolling,
  ManualPolling,
  OverrideBehaviour,
  OverrideValue,
  PollingOptions,
} from "./client/types.js";
export type {
  ErrorCode,
  EvaluationDetails,
  Reason,
  SettingType,
  SettingValue,
  User,
  UserAttributeValue,
  Warning,
  WarningCode,
} from "@productcraft/flags-engine";

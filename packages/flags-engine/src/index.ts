// @productcraft/flags-engine: the Flags evaluation engine (design 7). Pure and synchronous:
// no I/O, no timers, no dependencies. SPEC.md is the normative text; vectors/ are its tests.
export { parseConfig, ConfigParseError } from "./parse.js";
export type { ConfigParseErrorCode } from "./parse.js";
export { evaluate, evaluateAll, bucket, hashConfidential, isNewerConfig, MAX_PREREQUISITE_DEPTH } from "./evaluate.js";
export type {
  ConfigVersion,
  ErrorCode,
  EvaluationDetails,
  ParsedConfig,
  Reason,
  SettingType,
  SettingValue,
  User,
  UserAttributeValue,
  ValueFor,
  Warning,
  WarningCode,
} from "./types.js";

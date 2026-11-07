/**
 * @productcraft/core: the shared runtime behind every ProductCraft SDK.
 *
 * - `APIClient`: requests with retries, timeouts, automatic idempotency
 *   keys, typed errors, pagination, polling and webhook verification
 *   (docs/sdk-standard.md section 4).
 * - The 0.x primitives (`PCAuth`, `makeClient`, `PC_BASE_URL`, ...),
 *   kept for compatibility.
 */

export * from "./legacy.js";
export * from "./errors.js";
export {
  APIPromise,
  attachLastResponse,
  parseRateLimit,
  type LastResponse,
  type RateLimitInfo,
  type RateLimitWindow,
  type RawResult,
  type WithResponse,
} from "./api-promise.js";
export { Page, PagePromise, type PageResponse, type ToArrayOptions } from "./pagination.js";
export {
  APIClient,
  backoffMs,
  createOpenAPIClient,
  _resetWorkspaceCache,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  MAX_RETRY_AFTER_MS,
  PC_LOG_ENV,
  PC_WORKSPACE_ID_ENV,
  type ClientOptions,
  type HTTPMethod,
  type Logger,
  type LogLevel,
  type PollConfig,
  type PollOptions,
  type RequestOptions,
  type RequestSpec,
  type SDKIdentity,
} from "./client.js";
export {
  normalizeHeaders,
  signWebhook,
  timingSafeEqual,
  verifyWebhook,
  type SignedWebhook,
  type SignWebhookParams,
  type VerifyWebhookParams,
  type WebhookHeaders,
  type WebhookPayload,
} from "./webhooks.js";
export { CORE_VERSION } from "./version.js";

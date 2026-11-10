import { ProductCraftError } from "@productcraft/notify";

/** Why a browser helper refused, as a stable `code`. */
export type NotifyClientErrorCode =
  | "TOKEN_INVALID"
  | "WEBPUSH_UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "USER_GESTURE_REQUIRED"
  | "CLOSED";

/**
 * Thrown by `@productcraft/notify-js` for problems that are not an API response
 * (those stay `APIError` subclasses from `@productcraft/notify`).
 */
export class NotifyClientError extends ProductCraftError {
  static override readonly brandName: string = "NotifyClientError";
  readonly code: NotifyClientErrorCode;
  constructor(code: NotifyClientErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

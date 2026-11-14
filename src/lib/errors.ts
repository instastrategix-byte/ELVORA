/** Error codes shared by the API, services and UI. */
export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "business_rule"
  | "rate_limited"
  | "payload_too_large"
  | "service_unavailable"
  | "payment_failed"
  | "internal";

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  business_rule: 422,
  rate_limited: 429,
  payload_too_large: 413,
  service_unavailable: 503,
  payment_failed: 402,
  internal: 500,
};

export type FieldErrors = Record<string, string[] | undefined>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export type ApiErrorBody = { error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };
export type ApiSuccess<T> = { data: T };
export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

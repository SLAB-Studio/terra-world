export type ZeroGConfigErrorCode =
  "MISSING_VALUE" | "INVALID_VALUE" | "INSECURE_URL" | "NETWORK_MISMATCH";

export class ZeroGConfigError extends Error {
  readonly code: ZeroGConfigErrorCode;
  readonly field: string;

  constructor(code: ZeroGConfigErrorCode, field: string, message: string) {
    super(message);
    this.name = "ZeroGConfigError";
    this.code = code;
    this.field = field;
  }
}

export type ZeroGServiceErrorCode =
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "PAYMENT_REQUIRED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK_FAILURE"
  | "UNKNOWN";

export class ZeroGServiceError extends Error {
  readonly code: ZeroGServiceErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    code: ZeroGServiceErrorCode,
    message: string,
    options: { retryable: boolean; status?: number; requestId?: string },
  ) {
    super(message);
    this.name = "ZeroGServiceError";
    this.code = code;
    this.retryable = options.retryable;
    if (options.status !== undefined) this.status = options.status;
    if (options.requestId !== undefined) this.requestId = options.requestId;
  }
}

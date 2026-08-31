import type { ZeroGComputeConfig } from "./config";
import { ZeroGServiceError } from "./errors";
import {
  isRetryableZeroGStatus,
  parseRetryAfterMs,
  retryDelayMs,
} from "./retry";

export type ZeroGChatMessage = Readonly<{
  role: "system" | "user";
  content: string;
}>;

export type ZeroGChatCompletionInput = Readonly<{
  messages: readonly ZeroGChatMessage[];
  maxTokens: number;
  temperature?: number;
}>;

export type ZeroGBillingMetadata = Readonly<Record<string, string | number>>;

export type ZeroGComputeResult = Readonly<{
  payload: unknown;
  provider: `0x${string}`;
  requestId: string;
  billing?: ZeroGBillingMetadata;
  trustMode: "private";
  teeVerificationRequested: boolean;
  teeVerified: boolean;
}>;

export type ZeroGComputeRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type ZeroGComputeClient = Readonly<{
  createChatCompletion(
    input: ZeroGChatCompletionInput,
    options?: ZeroGComputeRequestOptions,
  ): Promise<ZeroGComputeResult>;
}>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ComputeClientDependencies = Readonly<{
  fetch?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
}>;

type RouterTrace = Readonly<{
  provider: `0x${string}`;
  requestId: string;
  teeVerified: boolean;
  billing?: ZeroGBillingMetadata;
}>;

export function createZeroGComputeClient(
  config: ZeroGComputeConfig,
  dependencies: ComputeClientDependencies = {},
): ZeroGComputeClient {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? defaultSleep;

  if (typeof fetchRequest !== "function") {
    throw new TypeError("A server-side fetch implementation is required");
  }

  return Object.freeze({
    async createChatCompletion(
      input: ZeroGChatCompletionInput,
      options: ZeroGComputeRequestOptions = {},
    ): Promise<ZeroGComputeResult> {
      validateCompletionInput(input);
      throwIfCancelled(options.signal);
      const body = JSON.stringify({
        model: config.compute.model,
        messages: input.messages,
        max_tokens: input.maxTokens,
        temperature: input.temperature ?? 0.2,
        stream: false,
        verify_tee: config.compute.verifyTee,
      });

      let latestError: ZeroGServiceError | undefined;
      for (
        let attempt = 0;
        attempt <= config.request.maxRetries;
        attempt += 1
      ) {
        throwIfCancelled(options.signal);
        const controller = new AbortController();
        let timedOut = false;
        const cancel = () => controller.abort(options.signal?.reason);
        options.signal?.addEventListener("abort", cancel, { once: true });
        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, config.request.timeoutMs);
        try {
          const response = await fetchRequest(
            `${config.compute.baseUrl}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.compute.apiKey}`,
                "Content-Type": "application/json",
                "X-0G-Provider-Allow-Fallbacks": String(
                  config.compute.allowProviderFallbacks ?? false,
                ),
                "X-0G-Provider-Sort": config.compute.providerSort ?? "price",
                "X-0G-Provider-Trust-Mode": config.compute.trustMode,
              },
              body,
              signal: controller.signal,
            },
          );

          if (response.ok) {
            const payload = await parseJsonResponse(response);
            const trace = parseRouterTrace(payload, config.compute.verifyTee);
            return Object.freeze({
              payload,
              provider: trace.provider,
              requestId: trace.requestId,
              ...(trace.billing ? { billing: trace.billing } : {}),
              trustMode: config.compute.trustMode,
              teeVerificationRequested: config.compute.verifyTee,
              teeVerified: trace.teeVerified,
            });
          }

          latestError = await errorFromResponse(response);
          if (!latestError.retryable || attempt === config.request.maxRetries) {
            throw latestError;
          }
          const retryAfter = parseRetryAfterMs(
            response.headers.get("retry-after"),
          );
          clearTimeout(timeout);
          await sleepUnlessCancelled(
            sleep,
            retryDelayMs(attempt, retryAfter),
            options.signal,
          );
        } catch (error) {
          if (error instanceof ZeroGServiceError) throw error;
          if (options.signal?.aborted) throw cancelledError();
          latestError = new ZeroGServiceError(
            timedOut ? "TIMEOUT" : "NETWORK_FAILURE",
            timedOut
              ? "0G Compute request timed out"
              : "0G Compute network request failed",
            { retryable: true },
          );
          if (attempt === config.request.maxRetries) throw latestError;
          await sleepUnlessCancelled(
            sleep,
            retryDelayMs(attempt),
            options.signal,
          );
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener("abort", cancel);
        }
      }

      throw (
        latestError ??
        new ZeroGServiceError("UNKNOWN", "0G Compute request failed", {
          retryable: false,
        })
      );
    },
  });
}

function validateCompletionInput(input: ZeroGChatCompletionInput): void {
  if (
    !Number.isInteger(input.maxTokens) ||
    input.maxTokens < 1 ||
    input.maxTokens > 2_048
  ) {
    throw new TypeError("Compute maxTokens must be between 1 and 2048");
  }
  if (
    input.temperature !== undefined &&
    (!Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 1)
  ) {
    throw new TypeError("Compute temperature must be between 0 and 1");
  }
  if (input.messages.length < 1 || input.messages.length > 8) {
    throw new TypeError(
      "Compute messages must contain between 1 and 8 entries",
    );
  }
  for (const message of input.messages) {
    if (
      (message.role !== "system" && message.role !== "user") ||
      !message.content.trim() ||
      message.content.length > 16_000
    ) {
      throw new TypeError("Compute message is invalid");
    }
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ZeroGServiceError(
      "INVALID_RESPONSE",
      "0G Compute returned an invalid JSON response",
      { retryable: false, status: response.status },
    );
  }
}

function parseRouterTrace(
  payload: unknown,
  teeRequested: boolean,
): RouterTrace {
  if (!isRecord(payload) || !isRecord(payload.x_0g_trace)) {
    throw invalidTrace("0G Compute response is missing x_0g_trace");
  }
  const trace = payload.x_0g_trace;
  if (
    typeof trace.provider !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/u.test(trace.provider)
  ) {
    throw invalidTrace("0G Compute trace has an invalid provider");
  }
  if (
    typeof trace.request_id !== "string" ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(trace.request_id)
  ) {
    throw invalidTrace("0G Compute trace has an invalid request id");
  }
  if (
    trace.tee_verified !== undefined &&
    typeof trace.tee_verified !== "boolean"
  ) {
    throw invalidTrace("0G Compute trace has an invalid TEE verdict");
  }
  if (teeRequested && trace.tee_verified !== true) {
    throw new ZeroGServiceError(
      "TEE_VERIFICATION_FAILED",
      "0G Compute did not return a successful TEE verification verdict",
      { retryable: false, requestId: trace.request_id },
    );
  }
  const billing =
    trace.billing === undefined ? undefined : parseBilling(trace.billing);
  return Object.freeze({
    provider: trace.provider as `0x${string}`,
    requestId: trace.request_id,
    teeVerified: trace.tee_verified === true,
    ...(billing ? { billing } : {}),
  });
}

function parseBilling(value: unknown): ZeroGBillingMetadata {
  if (!isRecord(value)) {
    throw invalidTrace("0G Compute trace has invalid billing metadata");
  }
  const entries = Object.entries(value);
  if (entries.length > 24) {
    throw invalidTrace("0G Compute trace has invalid billing metadata");
  }
  const billing: Record<string, string | number> = {};
  for (const [key, entry] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)) {
      throw invalidTrace("0G Compute trace has invalid billing metadata");
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry) || entry < 0) {
        throw invalidTrace("0G Compute trace has invalid billing metadata");
      }
      billing[key] = entry;
      continue;
    }
    if (
      typeof entry !== "string" ||
      entry.length > 128 ||
      !/^[A-Za-z0-9 ._:+/-]*$/u.test(entry)
    ) {
      throw invalidTrace("0G Compute trace has invalid billing metadata");
    }
    billing[key] = entry;
  }
  return Object.freeze(billing);
}

function invalidTrace(message: string): ZeroGServiceError {
  return new ZeroGServiceError("INVALID_RESPONSE", message, {
    retryable: false,
  });
}

async function errorFromResponse(
  response: Response,
): Promise<ZeroGServiceError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const requestId =
    response.headers.get("x-request-id") ?? requestIdFromPayload(payload);
  const routerCode = errorCodeFromPayload(payload);
  const status = response.status;
  const code =
    status === 400
      ? "INVALID_REQUEST"
      : status === 401
        ? "AUTHENTICATION"
        : status === 402
          ? "PAYMENT_REQUIRED"
          : status === 403
            ? "PERMISSION_DENIED"
            : status === 429
              ? "RATE_LIMITED"
              : status === 502 || status === 503
                ? "PROVIDER_UNAVAILABLE"
                : "UNKNOWN";
  return new ZeroGServiceError(
    code,
    routerCode
      ? `0G Compute request failed: ${routerCode}`
      : `0G Compute request failed with status ${status}`,
    {
      retryable: isRetryableZeroGStatus(status),
      status,
      ...(requestId ? { requestId } : {}),
    },
  );
}

function requestIdFromPayload(payload: unknown): string | undefined {
  if (
    isRecord(payload) &&
    typeof payload.request_id === "string" &&
    payload.request_id.length <= 256
  ) {
    return payload.request_id;
  }
  return undefined;
}

function errorCodeFromPayload(payload: unknown): string | undefined {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.code === "string"
  ) {
    return payload.error.code.slice(0, 120);
  }
  return undefined;
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError();
}

function cancelledError(): ZeroGServiceError {
  return new ZeroGServiceError(
    "CANCELLED",
    "0G Compute request was cancelled",
    {
      retryable: false,
    },
  );
}

async function sleepUnlessCancelled(
  sleep: (delayMs: number) => Promise<void>,
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfCancelled(signal);
  if (!signal) {
    await sleep(delayMs);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const cancel = () => reject(cancelledError());
    signal.addEventListener("abort", cancel, { once: true });
    void sleep(delayMs)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", cancel);
      });
  });
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

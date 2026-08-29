import type { ZeroGServerConfig } from "./config";
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

export type ZeroGComputeResult = Readonly<{
  payload: unknown;
  requestId?: string;
  trustMode: "private";
  teeVerificationRequested: true;
}>;

export type ZeroGComputeClient = Readonly<{
  createChatCompletion(
    input: ZeroGChatCompletionInput,
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

export function createZeroGComputeClient(
  config: ZeroGServerConfig,
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
    ): Promise<ZeroGComputeResult> {
      validateCompletionInput(input);
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
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          config.request.timeoutMs,
        );
        try {
          const response = await fetchRequest(
            `${config.compute.baseUrl}/chat/completions`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.compute.apiKey}`,
                "Content-Type": "application/json",
                "X-0G-Provider-Trust-Mode": config.compute.trustMode,
              },
              body,
              signal: controller.signal,
            },
          );

          if (response.ok) {
            const payload = await parseJsonResponse(response);
            const requestId =
              response.headers.get("x-request-id") ??
              requestIdFromPayload(payload);
            return Object.freeze({
              payload,
              ...(requestId ? { requestId } : {}),
              trustMode: "private" as const,
              teeVerificationRequested: true as const,
            });
          }

          latestError = await errorFromResponse(response);
          if (!latestError.retryable || attempt === config.request.maxRetries) {
            throw latestError;
          }
          const retryAfter = parseRetryAfterMs(
            response.headers.get("retry-after"),
          );
          await sleep(retryDelayMs(attempt, retryAfter));
        } catch (error) {
          if (error instanceof ZeroGServiceError) throw error;
          const aborted = controller.signal.aborted;
          latestError = new ZeroGServiceError(
            aborted ? "TIMEOUT" : "NETWORK_FAILURE",
            aborted
              ? "0G Compute request timed out"
              : "0G Compute network request failed",
            { retryable: true },
          );
          if (attempt === config.request.maxRetries) throw latestError;
          await sleep(retryDelayMs(attempt));
        } finally {
          clearTimeout(timeout);
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
      "UNKNOWN",
      "0G Compute returned an invalid JSON response",
      { retryable: false, status: response.status },
    );
  }
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
    typeof payload === "object" &&
    payload !== null &&
    "request_id" in payload &&
    typeof payload.request_id === "string"
  ) {
    return payload.request_id;
  }
  return undefined;
}

function errorCodeFromPayload(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    return payload.error.code.slice(0, 120);
  }
  return undefined;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

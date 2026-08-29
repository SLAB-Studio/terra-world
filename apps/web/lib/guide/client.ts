import {
  projectCityGuideRequest,
  serializeCityGuideRequest,
  type CityGuideProjectionInput,
  type CityGuideRequest,
} from "../../../../packages/safety/src/city-guide";
import {
  validateCityGuideResponse,
  type CityGuideResponse,
} from "../../../../packages/safety/src/guide-output";

export const CITY_GUIDE_CLIENT_LIMITS = {
  defaultTimeoutMs: 5_000,
  maximumTimeoutMs: 15_000,
  maximumResponseBytes: 32 * 1_024,
} as const;

export const CITY_GUIDE_ENDPOINT = "/api/guide" as const;

export type CityGuideVisibleSource =
  "private-compute" | "verified-cache" | "authored-server" | "authored-local";

/** Safe, user-visible provenance for the adult proof panel. */
export type CityGuideProof = Readonly<{
  route: typeof CITY_GUIDE_ENDPOINT;
  source: CityGuideVisibleSource | "unavailable";
  serverSource: "provider" | "cache" | "fallback" | "none";
  validation: "passed" | "unavailable";
  network: "reached" | "not-reached";
  label: string;
}>;

export type CityGuideClientResult =
  | Readonly<{
      ok: true;
      guide: CityGuideResponse;
      source: CityGuideVisibleSource;
      proof: CityGuideProof;
    }>
  | Readonly<{
      ok: false;
      guide: null;
      source: "unavailable";
      proof: CityGuideProof;
      childMessage: "Leo is taking a quiet moment. Your city still works without the guide.";
    }>;

export type CityGuideClientOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}>;

export type CityGuideRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

export type CityGuideClient = Readonly<{
  request(
    input: CityGuideProjectionInput,
    options?: CityGuideRequestOptions,
  ): Promise<CityGuideClientResult>;
}>;

export type CityGuideControllerSnapshot =
  | Readonly<{ status: "idle"; result: null }>
  | Readonly<{ status: "loading"; result: null }>
  | Readonly<{ status: "ready"; result: CityGuideClientResult }>;

export type CityGuideController = Readonly<{
  request(input: CityGuideProjectionInput): Promise<CityGuideClientResult>;
  cancel(): void;
  dispose(): void;
  getSnapshot(): CityGuideControllerSnapshot;
  subscribe(listener: () => void): () => void;
}>;

type RemoteGuideSource = "provider" | "cache" | "fallback";

type RemoteGuidePayload = Readonly<{
  guide: CityGuideResponse;
  source: RemoteGuideSource;
}>;

/**
 * Browser boundary for the optional guide. It can only serialize the existing
 * privacy projection, and every transport or validation failure resolves to a
 * separately validated authored response.
 */
export function createCityGuideClient(
  options: CityGuideClientOptions = {},
): CityGuideClient {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs =
    options.timeoutMs ?? CITY_GUIDE_CLIENT_LIMITS.defaultTimeoutMs;
  assertTimeout(timeoutMs);

  return Object.freeze({
    async request(
      input: CityGuideProjectionInput,
      requestOptions: CityGuideRequestOptions = {},
    ): Promise<CityGuideClientResult> {
      let request: CityGuideRequest;
      try {
        // This projector is the sole outbound-data boundary. Extra properties
        // such as profile records, free text, wallet data, or city identifiers
        // are discarded before serialization.
        request = projectCityGuideRequest(input);
      } catch {
        return unavailableResult("not-reached");
      }

      const controller = new AbortController();
      const removeExternalAbort = forwardAbort(
        requestOptions.signal,
        controller,
      );
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let networkReached = false;

      try {
        if (controller.signal.aborted) {
          return resolveLocalFallback(request, "not-reached");
        }
        const response = await fetchImplementation(CITY_GUIDE_ENDPOINT, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: serializeCityGuideRequest(request),
          cache: "no-store",
          credentials: "same-origin",
          referrerPolicy: "same-origin",
          signal: controller.signal,
        });
        networkReached = true;

        if (!response.ok) return resolveLocalFallback(request, "reached");

        const text = await readBoundedResponse(response);
        const remote = parseRemoteGuidePayload(request, text);
        if (remote === null) return resolveLocalFallback(request, "reached");

        return remoteResult(remote);
      } catch {
        return resolveLocalFallback(
          request,
          networkReached ? "reached" : "not-reached",
        );
      } finally {
        clearTimeout(timeout);
        removeExternalAbort();
      }
    },
  });
}

/**
 * Latest-request controller for React or other subscribed UIs. Calling this
 * method never blocks the simulation; consumers may intentionally ignore its
 * returned promise and render snapshots as they arrive.
 */
export function createCityGuideController(
  options: CityGuideClientOptions = {},
): CityGuideController {
  const client = createCityGuideClient(options);
  const listeners = new Set<() => void>();
  let snapshot: CityGuideControllerSnapshot = { status: "idle", result: null };
  let active: AbortController | null = null;
  let requestId = 0;
  let disposed = false;

  const publish = (next: CityGuideControllerSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return Object.freeze({
    async request(input): Promise<CityGuideClientResult> {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const currentRequestId = ++requestId;
      if (!disposed) publish({ status: "loading", result: null });

      const result = await client.request(input, { signal: controller.signal });
      if (!disposed && currentRequestId === requestId) {
        active = null;
        publish({ status: "ready", result });
      }
      return result;
    },
    cancel(): void {
      active?.abort();
      active = null;
      requestId += 1;
      if (!disposed) publish({ status: "idle", result: null });
    },
    dispose(): void {
      active?.abort();
      active = null;
      requestId += 1;
      disposed = true;
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function parseRemoteGuidePayload(
  request: CityGuideRequest,
  serialized: string,
): RemoteGuidePayload | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value) || !hasOnlyKeys(value, ["guide", "source"])) return null;
  if (!isRemoteSource(value.source) || !isRecord(value.guide)) return null;

  const validation = validateCityGuideResponse(
    request,
    JSON.stringify(value.guide),
  );
  if (!validation.ok) return null;
  return { guide: validation.value, source: value.source };
}

function resolveLocalFallback(
  request: CityGuideRequest,
  network: "reached" | "not-reached",
): CityGuideClientResult {
  const authored = authoredFallback(request);
  if (authored === null) return unavailableResult(network);
  const validation = validateCityGuideResponse(
    request,
    JSON.stringify(authored),
  );
  if (!validation.ok) return unavailableResult(network);

  const source = "authored-local" as const;
  return {
    ok: true,
    guide: validation.value,
    source,
    proof: {
      route: CITY_GUIDE_ENDPOINT,
      source,
      serverSource: "none",
      validation: "passed",
      network,
      label: "Safety-checked lesson stored in Terra World",
    },
  };
}

function authoredFallback(request: CityGuideRequest): unknown | null {
  const grounding = authoredGrounding(request);
  switch (request.task) {
    case "explain":
      return {
        headline: "Look at what changed",
        message:
          "I noticed one verified change in our city. Let us compare what was there before with what appeared after.",
        reflectiveQuestion: "What changed first after your choice?",
        grounding,
      };
    case "hint":
      return {
        headline: "Notice one small clue",
        message:
          "I can help us inspect the verified mission clues one step at a time.",
        hints: [
          "Look around before making another change.",
          "Compare the city before and after your last choice.",
          "Use the highlighted cause to choose the next check.",
        ],
        grounding,
      };
    case "react":
      return {
        headline: "Something changed",
        message:
          "I noticed one verified change in our city. What else looks different around it?",
        grounding,
      };
    case "memory": {
      const milestone = request.causes.find((cause) =>
        cause.code.startsWith("milestone."),
      );
      const factKey =
        request.allowedFactKeys[0] ?? request.relevantMemories[0]?.factKey;
      if (milestone === undefined || factKey === undefined) return null;
      return {
        headline: "A city milestone",
        message:
          "I will remember this verified milestone as part of our city learning story.",
        memoryCandidate: {
          milestoneId: milestone.code.slice("milestone.".length),
          earnedTurn: request.after.turn,
          factKey,
          causeCodes: [milestone.code],
        },
        grounding: {
          metricKeys: [],
          buildingIds: [],
          factKeys: [factKey],
          messageKeys: [],
          causeCodes: [milestone.code],
        },
      };
    }
  }
}

function authoredGrounding(request: CityGuideRequest) {
  const causeCode = request.causes[0]?.code;
  const factKey = request.allowedFactKeys[0];
  if (causeCode !== undefined || factKey !== undefined) {
    return {
      metricKeys: [],
      buildingIds: [],
      factKeys: factKey === undefined ? [] : [factKey],
      messageKeys: [],
      causeCodes: causeCode === undefined ? [] : [causeCode],
    };
  }
  return {
    metricKeys: [],
    buildingIds: [],
    factKeys: [],
    messageKeys: [request.mission.briefingKey],
    causeCodes: [],
  };
}

function remoteResult(payload: RemoteGuidePayload): CityGuideClientResult {
  const details: Readonly<
    Record<RemoteGuideSource, { source: CityGuideVisibleSource; label: string }>
  > = {
    provider: {
      source: "private-compute",
      label: "Private 0G Compute response, checked against city facts",
    },
    cache: {
      source: "verified-cache",
      label: "Previously checked private guide response",
    },
    fallback: {
      source: "authored-server",
      label: "Safety-checked lesson from the Terra World server",
    },
  };
  const detail = details[payload.source];
  return {
    ok: true,
    guide: payload.guide,
    source: detail.source,
    proof: {
      route: CITY_GUIDE_ENDPOINT,
      source: detail.source,
      serverSource: payload.source,
      validation: "passed",
      network: "reached",
      label: detail.label,
    },
  };
}

async function readBoundedResponse(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number(declaredLength) > CITY_GUIDE_CLIENT_LIMITS.maximumResponseBytes
  ) {
    throw INVALID_RESPONSE;
  }
  if (response.body === null) throw INVALID_RESPONSE;

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > CITY_GUIDE_CLIENT_LIMITS.maximumResponseBytes) {
        await reader.cancel();
        throw INVALID_RESPONSE;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function forwardAbort(
  signal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (signal === undefined) return () => undefined;
  if (signal.aborted) {
    controller.abort();
    return () => undefined;
  }
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

function unavailableResult(
  network: "reached" | "not-reached",
): CityGuideClientResult {
  return {
    ok: false,
    guide: null,
    source: "unavailable",
    proof: {
      route: CITY_GUIDE_ENDPOINT,
      source: "unavailable",
      serverSource: "none",
      validation: "unavailable",
      network,
      label: "Guide unavailable; the city simulation continues locally",
    },
    childMessage:
      "Leo is taking a quiet moment. Your city still works without the guide.",
  };
}

function assertTimeout(value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > CITY_GUIDE_CLIENT_LIMITS.maximumTimeoutMs
  ) {
    throw new RangeError(
      `timeoutMs must be an integer from 1 to ${CITY_GUIDE_CLIENT_LIMITS.maximumTimeoutMs}`,
    );
  }
}

function isRemoteSource(value: unknown): value is RemoteGuideSource {
  return value === "provider" || value === "cache" || value === "fallback";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowed.length && keys.every((key) => allowed.includes(key))
  );
}

const INVALID_RESPONSE = Symbol("invalid-response");

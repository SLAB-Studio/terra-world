import { z } from "zod";

import { CityGuideAgeBandSchema, CityGuideTaskSchema } from "./city-guide";
import { assertNoProhibitedComputeData } from "./prohibited-data";

/** Executable policy: content and identity fields have no representation here. */
export const CITY_GUIDE_LOGGING_POLICY = Object.freeze({
  requestContent: "never",
  responseContent: "never",
  childIdentity: "never",
  rawErrors: "never",
  operationalEnumsOnly: true,
} as const);

export const CityGuideTelemetryEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    event: z.literal("city-guide-resolution"),
    task: CityGuideTaskSchema,
    ageBand: CityGuideAgeBandSchema,
    source: z.enum(["provider", "cache", "fallback", "none"]),
    outcome: z.enum(["served", "content-unavailable"]),
    failureClass: z
      .enum([
        "none",
        "timeout",
        "provider-unavailable",
        "rate-limited",
        "invalid-output",
        "non-private-provider",
        "fallback-invalid",
        "configuration",
        "unknown",
      ])
      .optional(),
    durationBucket: z.enum(["under-250ms", "250ms-1s", "1s-3s", "over-3s"]),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.source === "provider" || event.source === "cache") {
      if (event.failureClass !== undefined && event.failureClass !== "none") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["failureClass"],
          message: "Successful provider/cache results cannot report a failure",
        });
      }
    }
    if (event.source === "none" && event.outcome !== "content-unavailable") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outcome"],
        message: "A missing guide result must be content-unavailable",
      });
    }
  });

export type CityGuideTelemetryEvent = z.infer<
  typeof CityGuideTelemetryEventSchema
>;

export type CityGuideTelemetrySink = (
  event: CityGuideTelemetryEvent,
) => void | Promise<void>;

export type CityGuideTelemetryReporter = Readonly<{
  /** Logging is best-effort and can never fail or delay the game turn. */
  record(input: unknown): Promise<boolean>;
}>;

export function createCityGuideTelemetryReporter(
  sink: CityGuideTelemetrySink,
): CityGuideTelemetryReporter {
  if (typeof sink !== "function") {
    throw new TypeError("A city guide telemetry sink is required");
  }
  return Object.freeze({
    async record(input: unknown): Promise<boolean> {
      let event: CityGuideTelemetryEvent;
      try {
        event = parseCityGuideTelemetryEvent(input);
      } catch {
        return false;
      }
      try {
        await sink(event);
        return true;
      } catch {
        return false;
      }
    },
  });
}

export function parseCityGuideTelemetryEvent(
  input: unknown,
): CityGuideTelemetryEvent {
  const event = CityGuideTelemetryEventSchema.parse(input);
  assertNoProhibitedComputeData(event);
  return event;
}

export function cityGuideDurationBucket(
  durationMs: number,
): CityGuideTelemetryEvent["durationBucket"] {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new TypeError("City guide duration must be a non-negative number");
  }
  if (durationMs < 250) return "under-250ms";
  if (durationMs < 1_000) return "250ms-1s";
  if (durationMs < 3_000) return "1s-3s";
  return "over-3s";
}

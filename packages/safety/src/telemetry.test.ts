import { describe, expect, it, vi } from "vitest";

import {
  CITY_GUIDE_LOGGING_POLICY,
  cityGuideDurationBucket,
  createCityGuideTelemetryReporter,
  parseCityGuideTelemetryEvent,
} from "./telemetry";

const SAFE_EVENT = {
  schemaVersion: 1,
  event: "city-guide-resolution",
  task: "explain",
  ageBand: "8-10",
  source: "fallback",
  outcome: "served",
  failureClass: "timeout",
  durationBucket: "1s-3s",
} as const;

describe("city guide operational telemetry", () => {
  it("allows only bounded operational enums", () => {
    expect(parseCityGuideTelemetryEvent(SAFE_EVENT)).toEqual(SAFE_EVENT);
    expect(CITY_GUIDE_LOGGING_POLICY).toEqual({
      requestContent: "never",
      responseContent: "never",
      childIdentity: "never",
      rawErrors: "never",
      operationalEnumsOnly: true,
    });
  });

  it.each([
    { ...SAFE_EVENT, childName: "A child" },
    { ...SAFE_EVENT, rawPrompt: "Tell me your school" },
    { ...SAFE_EVENT, response: "provider output" },
    { ...SAFE_EVENT, error: "sk-secret-key" },
    { ...SAFE_EVENT, wallet: `0x${"ab".repeat(20)}` },
    { ...SAFE_EVENT, failureClass: "provider said child@example.com" },
  ])("rejects content, identity, secrets, and arbitrary errors", (event) => {
    expect(() => parseCityGuideTelemetryEvent(event)).toThrow();
  });

  it("enforces outcome/source consistency", () => {
    expect(() =>
      parseCityGuideTelemetryEvent({
        ...SAFE_EVENT,
        source: "provider",
        failureClass: "timeout",
      }),
    ).toThrow();
    expect(() =>
      parseCityGuideTelemetryEvent({
        ...SAFE_EVENT,
        source: "none",
        outcome: "served",
      }),
    ).toThrow();
  });

  it("records a safe copy and swallows sink or validation failures", async () => {
    const sink = vi.fn(async () => undefined);
    const reporter = createCityGuideTelemetryReporter(sink);

    await expect(reporter.record(SAFE_EVENT)).resolves.toBe(true);
    expect(sink).toHaveBeenCalledWith(SAFE_EVENT);
    await expect(
      reporter.record({ ...SAFE_EVENT, rawResponse: "private text" }),
    ).resolves.toBe(false);
    expect(sink).toHaveBeenCalledTimes(1);

    const failing = createCityGuideTelemetryReporter(() => {
      throw new Error("logging backend included a secret");
    });
    await expect(failing.record(SAFE_EVENT)).resolves.toBe(false);
  });

  it.each([
    [0, "under-250ms"],
    [249.99, "under-250ms"],
    [250, "250ms-1s"],
    [999.99, "250ms-1s"],
    [1_000, "1s-3s"],
    [2_999.99, "1s-3s"],
    [3_000, "over-3s"],
  ] as const)(
    "buckets duration %s without logging exact timing",
    (value, bucket) => {
      expect(cityGuideDurationBucket(value)).toBe(bucket);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid duration %s",
    (value) => {
      expect(() => cityGuideDurationBucket(value)).toThrow();
    },
  );
});

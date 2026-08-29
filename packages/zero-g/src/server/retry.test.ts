import { describe, expect, it } from "vitest";

import {
  createZeroGIdempotencyKey,
  isRetryableZeroGStatus,
  parseRetryAfterMs,
  retryDelayMs,
} from "./index";

describe("0G retry contracts", () => {
  it("retries only documented transient Router responses", () => {
    expect([429, 502, 503].every(isRetryableZeroGStatus)).toBe(true);
    expect([400, 401, 402, 403, 404].some(isRetryableZeroGStatus)).toBe(false);
  });

  it("honours numeric and HTTP-date Retry-After values", () => {
    expect(parseRetryAfterMs("15")).toBe(15_000);
    expect(
      parseRetryAfterMs("Thu, 01 Jan 2026 00:00:10 GMT", 1_767_225_600_000),
    ).toBe(10_000);
    expect(parseRetryAfterMs("not-a-date")).toBeUndefined();
    expect(retryDelayMs(9)).toBe(8_000);
    expect(retryDelayMs(0, 120_000)).toBe(60_000);
  });

  it("creates stable, scoped idempotency keys without leaking input", () => {
    const first = createZeroGIdempotencyKey(
      "checkpoint",
      "city:rivergate:chapter:1",
    );
    const second = createZeroGIdempotencyKey(
      "checkpoint",
      "city:rivergate:chapter:1",
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^terra-checkpoint-[a-f0-9]{64}$/);
    expect(first).not.toContain("rivergate");
  });
});

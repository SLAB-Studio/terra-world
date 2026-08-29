import { describe, expect, it, vi } from "vitest";

import {
  SponsorPolicyError,
  createSponsoredTransactionService,
  type SponsorRequest,
  type SponsorTransactionDriver,
} from "./server";

const CITY_AGENT = `0x${"a".repeat(40)}`;
const TRANSACTION_HASH = `0x${"c".repeat(64)}`;
const COMMITMENT = `0x${"d".repeat(64)}`;

describe("server-only sponsored transaction policy", () => {
  it("builds a transaction only from a fixed operation target and spend ceiling", async () => {
    const driver = fakeDriver();
    const service = makeService({ driver });

    const receipt = await service.execute(request());

    expect(receipt).toEqual({
      operation: "record-milestone",
      transactionHash: TRANSACTION_HASH,
      nonce: 7,
      spendUnits: 3,
    });
    expect(driver.execute).toHaveBeenCalledWith({
      operation: "record-milestone",
      target: CITY_AGENT,
      nonce: 7,
      maximumSpendUnits: 5,
      cityId: "rivergate-city",
      cityTokenId: "42",
      campaignVersion: 1,
      commitment: COMMITMENT,
    });
  });

  it.each([
    [
      "arbitrary operation",
      { operation: "send-anything" },
      "operation_not_allowed",
    ],
    ["recipient", { recipient: `0x${"e".repeat(40)}` }, "invalid_request"],
    ["contract", { contract: `0x${"e".repeat(40)}` }, "invalid_request"],
    ["calldata", { calldata: "0xdeadbeef" }, "invalid_request"],
    ["value", { value: 1_000_000 }, "invalid_request"],
    ["nonce", { nonce: 99 }, "invalid_request"],
  ])(
    "rejects %s before the transaction driver",
    async (_label, mutation, code) => {
      const driver = fakeDriver();
      const service = makeService({ driver });

      await expect(
        service.execute({ ...request(), ...mutation }),
      ).rejects.toMatchObject({
        code,
      });
      expect(driver.execute).not.toHaveBeenCalled();
    },
  );

  it("returns an idempotent receipt without spending or incrementing the nonce twice", async () => {
    const driver = fakeDriver();
    const service = makeService({ driver });

    const first = await service.execute(request());
    const duplicate = await service.execute(request());
    const next = await service.execute(
      request({ idempotencyKey: "milestone-run-0002" }),
    );

    expect(duplicate).toEqual(first);
    expect(next.nonce).toBe(8);
    expect(driver.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects an idempotency collision before the transaction driver", async () => {
    const driver = fakeDriver();
    const service = makeService({ driver });
    await service.execute(request());

    await expect(
      service.execute(request({ commitment: `0x${"e".repeat(64)}` })),
    ).rejects.toMatchObject({ code: "idempotency_conflict", retryable: false });
    expect(driver.execute).toHaveBeenCalledTimes(1);
  });

  it("enforces per-session rate limits, daily spending, and emergency pause", async () => {
    let now = 1_000;
    let paused = false;
    const driver = fakeDriver();
    const service = makeService({
      driver,
      clock: () => now,
      isPaused: () => paused,
      requestsPerSessionWindow: 1,
      dailySpendLimitUnits: 10,
    });

    await service.execute(request());
    await expect(
      service.execute(request({ idempotencyKey: "milestone-run-0002" })),
    ).rejects.toMatchObject({ code: "rate_limited" });

    now += 60_000;
    await service.execute(request({ idempotencyKey: "milestone-run-0003" }));
    now += 60_000;
    await expect(
      service.execute(request({ idempotencyKey: "milestone-run-0004" })),
    ).rejects.toMatchObject({ code: "spending_limited" });

    paused = true;
    await expect(
      service.execute(request({ idempotencyKey: "milestone-run-0005" })),
    ).rejects.toMatchObject({ code: "paused" });
    expect(driver.execute).toHaveBeenCalledTimes(2);
  });

  it("serialises concurrent nonce allocation", async () => {
    const nonces: number[] = [];
    const driver: SponsorTransactionDriver = {
      execute: vi.fn(async (plan) => {
        nonces.push(plan.nonce);
        await Promise.resolve();
        return {
          transactionHash: TRANSACTION_HASH,
          nonce: plan.nonce,
          spendUnits: 1,
        };
      }),
    };
    const service = makeService({ driver, dailySpendLimitUnits: 20 });

    await Promise.all([
      service.execute(request({ idempotencyKey: "milestone-run-0002" })),
      service.execute(request({ idempotencyKey: "milestone-run-0003" })),
      service.execute(request({ idempotencyKey: "milestone-run-0004" })),
    ]);

    expect(nonces).toEqual([7, 8, 9]);
  });

  it("fails closed on an invalid or over-budget driver receipt", async () => {
    const service = makeService({
      driver: {
        execute: vi.fn().mockResolvedValue({
          transactionHash: TRANSACTION_HASH,
          nonce: 7,
          spendUnits: 6,
        }),
      },
    });

    await expect(service.execute(request())).rejects.toEqual(
      new SponsorPolicyError("transaction_failed", false),
    );
  });
});

function request(overrides: Partial<SponsorRequest> = {}): SponsorRequest {
  return {
    schemaVersion: 1,
    operation: "record-milestone",
    sessionId: "adult-session-1",
    idempotencyKey: "milestone-run-0001",
    cityId: "rivergate-city",
    cityTokenId: "42",
    campaignVersion: 1,
    commitment: COMMITMENT,
    ...overrides,
  };
}

function fakeDriver(): SponsorTransactionDriver {
  return {
    execute: vi.fn(async (plan) => ({
      transactionHash: TRANSACTION_HASH,
      nonce: plan.nonce,
      spendUnits: 3,
    })),
  };
}

function makeService(
  overrides: Partial<
    Parameters<typeof createSponsoredTransactionService>[0]
  > & {
    driver: SponsorTransactionDriver;
  },
) {
  return createSponsoredTransactionService({
    driver: overrides.driver,
    policies: {
      "create-city-agent": { target: CITY_AGENT, maximumSpendUnits: 10 },
      "update-city-intelligence": { target: CITY_AGENT, maximumSpendUnits: 5 },
      "record-milestone": { target: CITY_AGENT, maximumSpendUnits: 5 },
    },
    requestsPerSessionWindow: overrides.requestsPerSessionWindow ?? 10,
    sessionWindowMs: 60_000,
    dailySpendLimitUnits: overrides.dailySpendLimitUnits ?? 100,
    initialNonce: 7,
    isPaused: overrides.isPaused ?? (() => false),
    ...(overrides.clock === undefined ? {} : { clock: overrides.clock }),
  });
}

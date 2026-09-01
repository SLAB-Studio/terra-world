import { describe, expect, it, vi } from "vitest";

import type { AdultCheckpointRepository } from "./session-server";
import {
  CheckpointAnchorError,
  createCheckpointAnchorGlobalRateLimiter,
  createCheckpointAnchorPostHandler,
  type CheckpointAnchorEvidence,
  type CheckpointAnchorService,
} from "./anchor-server";

const ORIGIN = "https://terra.world";
const SESSION = Object.freeze({
  sessionId: `adult-session:${"a".repeat(64)}`,
});
const ROOT = `0x${"1".repeat(64)}` as `0x${string}`;
const AGENTIC_ROOT = `0x${"2".repeat(64)}` as `0x${string}`;
const CONTENT_HASH = `sha256:${"3".repeat(64)}` as `sha256:${string}`;
const IDEMPOTENCY_KEY = `checkpoint-v1-${"3".repeat(64)}`;
const STORAGE_TX = `0x${"4".repeat(64)}` as `0x${string}`;
const UPDATE_TX = `0x${"5".repeat(64)}` as `0x${string}`;
const CARD_TX = `0x${"6".repeat(64)}` as `0x${string}`;

describe("checkpoint AgenticID anchor handler", () => {
  it("anchors only exact server-resolved checkpoint evidence", async () => {
    const service = fakeService();
    const handler = makeHandler({ service });
    const response = await handler(anchorRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service.anchor).toHaveBeenCalledWith({
      checkpointRoot: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: 321,
      checkpointSavedAt: 12_345,
      idempotencyKey: IDEMPOTENCY_KEY,
      milestoneStorageTransactionHash: STORAGE_TX,
      milestoneStorageTransactionSequence: 77,
    });
    expect(await response.json()).toEqual({ ok: true, evidence: EVIDENCE });
  });

  it.each([
    ["proxy", { agenticIdProxy: `0x${"7".repeat(40)}` }],
    ["token", { agentTokenId: 3531123 }],
    ["index", { intelligentDataIndex: 0 }],
    ["description", { description: "browser supplied" }],
    ["chain", { chainId: 16661 }],
  ])("rejects browser-supplied %s authority", async (_label, extra) => {
    const service = fakeService();
    const response = await makeHandler({ service })(anchorRequest(extra));

    expect(response.status).toBe(400);
    expect(service.anchor).not.toHaveBeenCalled();
  });

  it("rejects checkpoint metadata that differs from the stored reference", async () => {
    const service = fakeService();
    const response = await makeHandler({ service })(
      anchorRequest({ byteLength: 322 }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      code: "checkpoint_rejected",
      retryable: false,
    });
    expect(service.anchor).not.toHaveBeenCalled();
  });

  it.each([12_344, 12_346])(
    "rejects checkpoint timestamp %s when it differs from stored metadata",
    async (checkpointSavedAt) => {
      const service = fakeService();
      const response = await makeHandler({ service })(
        anchorRequest({ checkpointSavedAt }),
      );

      expect(response.status).toBe(409);
      expect(service.anchor).not.toHaveBeenCalled();
    },
  );

  it("requires an authenticated adult checkpoint session", async () => {
    const service = fakeService();
    const response = await makeHandler({
      service,
      authorizeAdultSession: async () => null,
    })(anchorRequest());

    expect(response.status).toBe(401);
    expect(service.anchor).not.toHaveBeenCalled();
  });

  it("requires stored 0G transaction sequence evidence", async () => {
    const service = fakeService();
    const repository = fakeRepository({ transactionSequence: null });
    const response = await makeHandler({ repository, service })(
      anchorRequest(),
    );

    expect(response.status).toBe(409);
    expect(service.anchor).not.toHaveBeenCalled();
  });

  it("enforces both per-session and process-global paid-operation limits", async () => {
    const sessionLimited = makeHandler({
      sessionRateLimiter: { tryAcquire: () => false },
    });
    expect((await sessionLimited(anchorRequest())).status).toBe(429);

    const globalLimited = makeHandler({
      globalRateLimiter: { tryAcquire: () => false },
    });
    expect((await globalLimited(anchorRequest())).status).toBe(429);
  });

  it("sanitizes synchronizer errors and rejects malformed public evidence", async () => {
    const unavailable = fakeService({
      anchor: vi.fn(async () => {
        throw new CheckpointAnchorError("secret_upstream_detail", true);
      }),
    });
    const failed = await makeHandler({ service: unavailable })(anchorRequest());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      ok: false,
      code: "anchor_unavailable",
      retryable: true,
    });

    const malformed = fakeService({
      anchor: vi.fn(
        async () =>
          ({
            ...EVIDENCE,
            checkpointRoot: AGENTIC_ROOT,
          }) as CheckpointAnchorEvidence,
      ),
    });
    const rejected = await makeHandler({ service: malformed })(anchorRequest());
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toEqual({
      ok: false,
      code: "anchor_unavailable",
      retryable: false,
    });
  });

  it("provides a bounded fixed-window global limiter", () => {
    let now = 1_000;
    const limiter = createCheckpointAnchorGlobalRateLimiter({
      capacity: 2,
      windowMs: 1_000,
      clock: () => now,
    });
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    now = 2_000;
    expect(limiter.tryAcquire()).toBe(true);
  });
});

const EVIDENCE: CheckpointAnchorEvidence = Object.freeze({
  status: "synced",
  checkpointRoot: ROOT,
  agenticRoot: AGENTIC_ROOT,
  milestoneStorageTransactionHash: STORAGE_TX,
  milestoneStorageTransactionSequence: 78,
  milestoneStorageBlockNumber: null,
  updateAtTransactionHash: UPDATE_TX,
  updateAtBlockNumber: 100,
  agentCardTransactionHash: CARD_TX,
  agentCardBlockNumber: 101,
});

function anchorRequest(extra: Record<string, unknown> = {}): Request {
  return new Request(`${ORIGIN}/api/checkpoints/anchor`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      schemaVersion: 1,
      operation: "anchor",
      root: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: 321,
      checkpointSavedAt: 12_345,
      ...extra,
    }),
  });
}

function makeHandler(
  overrides: Partial<
    Parameters<typeof createCheckpointAnchorPostHandler>[0]
  > = {},
) {
  return createCheckpointAnchorPostHandler({
    repository: fakeRepository(),
    authorizeAdultSession: async () => SESSION,
    sessionRateLimiter: { tryAcquire: () => true },
    globalRateLimiter: { tryAcquire: () => true },
    service: fakeService(),
    allowedOrigins: [ORIGIN],
    ...overrides,
  });
}

function fakeRepository(
  referenceOverrides: Record<string, unknown> = {},
): AdultCheckpointRepository {
  return {
    createSession: vi.fn(),
    isSessionActive: vi.fn(async () => true),
    findByIdempotency: vi.fn(async () => null),
    attach: vi.fn(),
    findByRoot: vi.fn(async () => ({
      root: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: 321,
      transactionHash: STORAGE_TX,
      transactionSequence: 77,
      idempotencyKey: IDEMPOTENCY_KEY,
      checkpointSavedAt: 12_345,
      attachedAt: 12_400,
      ...referenceOverrides,
    })),
  };
}

function fakeService(
  overrides: Partial<CheckpointAnchorService> = {},
): CheckpointAnchorService & { anchor: ReturnType<typeof vi.fn> } {
  return {
    anchor: vi.fn(async () => EVIDENCE),
    ...overrides,
  } as CheckpointAnchorService & { anchor: ReturnType<typeof vi.fn> };
}

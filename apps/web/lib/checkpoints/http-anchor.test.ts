import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHECKPOINT_ANCHOR_ENDPOINT,
  CheckpointAnchorError,
  createCheckpointHttpAnchorClient,
  type CheckpointAnchorEvidence,
  type CheckpointAnchorRequest,
} from "./http-anchor";

const ROOT = `0x${"11".repeat(32)}` as const;
const AGENTIC_ROOT = `0x${"22".repeat(32)}` as const;
const STORAGE_TRANSACTION = `0x${"33".repeat(32)}` as const;
const UPDATE_TRANSACTION = `0x${"44".repeat(32)}` as const;
const AGENT_CARD_TRANSACTION = `0x${"55".repeat(32)}` as const;
const CONTENT_HASH = `sha256:${"a".repeat(64)}` as const;
const REQUEST: CheckpointAnchorRequest = {
  root: ROOT,
  contentHash: CONTENT_HASH,
  byteLength: 1_024,
  checkpointSavedAt: 1_788_228_800_000,
};
const EVIDENCE: CheckpointAnchorEvidence = {
  status: "synced",
  checkpointRoot: ROOT,
  agenticRoot: AGENTIC_ROOT,
  milestoneStorageTransactionHash: STORAGE_TRANSACTION,
  milestoneStorageTransactionSequence: 211_646,
  milestoneStorageBlockNumber: 42,
  updateAtTransactionHash: UPDATE_TRANSACTION,
  updateAtBlockNumber: 43,
  agentCardTransactionHash: AGENT_CARD_TRANSACTION,
  agentCardBlockNumber: 44,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("checkpoint AgenticID anchor HTTP client", () => {
  it("posts only the strict public checkpoint projection to the fixed same-origin route", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, evidence: EVIDENCE }));
    const client = createCheckpointHttpAnchorClient({
      fetch: fetcher as typeof fetch,
    });

    await expect(
      client.anchor({
        ...REQUEST,
        signer: "must-not-leave-browser-boundary",
        privateKey: "must-not-leave-browser-boundary",
      } as CheckpointAnchorRequest),
    ).resolves.toEqual(EVIDENCE);

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CHECKPOINT_ANCHOR_ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: 1,
      operation: "anchor",
      root: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: REQUEST.byteLength,
      checkpointSavedAt: REQUEST.checkpointSavedAt,
    });
    expect(JSON.stringify(init)).not.toMatch(
      /signer|private.?key|wallet|bearer/iu,
    );
  });

  it.each(["synced", "already-synced"] as const)(
    "accepts exact %s public evidence including nullable chain fields",
    async (status) => {
      const evidence = {
        ...EVIDENCE,
        status,
        milestoneStorageTransactionHash: null,
        milestoneStorageBlockNumber: null,
        updateAtTransactionHash: null,
        updateAtBlockNumber: null,
        agentCardTransactionHash: null,
        agentCardBlockNumber: null,
      };
      const client = createCheckpointHttpAnchorClient({
        fetch: vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ ok: true, evidence }),
          ) as typeof fetch,
      });

      await expect(client.anchor(REQUEST)).resolves.toEqual(evidence);
    },
  );

  it.each([
    ["extra outer key", { ok: true, evidence: EVIDENCE, extra: true }],
    ["wrong status", { ok: true, evidence: { ...EVIDENCE, status: "stored" } }],
    [
      "wrong checkpoint root",
      {
        ok: true,
        evidence: { ...EVIDENCE, checkpointRoot: `0x${"66".repeat(32)}` },
      },
    ],
    [
      "malformed transaction hash",
      {
        ok: true,
        evidence: { ...EVIDENCE, updateAtTransactionHash: "0xshort" },
      },
    ],
    [
      "negative block",
      { ok: true, evidence: { ...EVIDENCE, updateAtBlockNumber: -1 } },
    ],
    [
      "extra evidence key",
      { ok: true, evidence: { ...EVIDENCE, signer: "unexpected" } },
    ],
  ] as const)("rejects %s", async (_label, payload) => {
    const client = createCheckpointHttpAnchorClient({
      fetch: vi.fn().mockResolvedValue(jsonResponse(payload)) as typeof fetch,
    });

    await expect(client.anchor(REQUEST)).rejects.toEqual(
      new CheckpointAnchorError("invalid_response", false),
    );
  });

  it("preserves bounded server failures and maps malformed errors safely", async () => {
    const limited = createCheckpointHttpAnchorClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { ok: false, code: "rate_limited", retryable: true },
            429,
          ),
        ) as typeof fetch,
    });
    const malformed = createCheckpointHttpAnchorClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: false, error: "internal detail" }, 503),
        ) as typeof fetch,
    });

    await expect(limited.anchor(REQUEST)).rejects.toEqual(
      new CheckpointAnchorError("rate_limited", true),
    );
    await expect(malformed.anchor(REQUEST)).rejects.toEqual(
      new CheckpointAnchorError("server_unavailable", true),
    );
  });

  it("uses a bounded timeout and maps transport failures without leaking details", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const client = createCheckpointHttpAnchorClient({
      fetch: fetcher as typeof fetch,
      timeoutMs: 1_000,
    });
    const request = client.anchor(REQUEST);
    const rejection = expect(request).rejects.toEqual(
      new CheckpointAnchorError("network_failure", true),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(
      true,
    );
    expect(() =>
      createCheckpointHttpAnchorClient({ timeoutMs: 360_001 }),
    ).toThrow("timeout");
  });

  it("rejects invalid inputs, media types, and oversized responses", async () => {
    const fetcher = vi.fn();
    const client = createCheckpointHttpAnchorClient({
      fetch: fetcher as typeof fetch,
    });
    await expect(
      client.anchor({ ...REQUEST, root: "0xshort" as `0x${string}` }),
    ).rejects.toThrow("request is invalid");
    expect(fetcher).not.toHaveBeenCalled();

    const wrongMedia = createCheckpointHttpAnchorClient({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, evidence: EVIDENCE }), {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ) as typeof fetch,
    });
    await expect(wrongMedia.anchor(REQUEST)).rejects.toEqual(
      new CheckpointAnchorError("invalid_response", false),
    );

    const oversized = createCheckpointHttpAnchorClient({
      fetch: vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "16385",
          },
        }),
      ) as typeof fetch,
    });
    await expect(oversized.anchor(REQUEST)).rejects.toEqual(
      new CheckpointAnchorError("invalid_response", false),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

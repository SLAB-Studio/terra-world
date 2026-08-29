import { describe, expect, it, vi } from "vitest";

import {
  CheckpointRemoteError,
  type CheckpointDownloadRequest,
  type CheckpointUploadRequest,
} from "./backup";
import { createCheckpointHttpRemoteStorage } from "./http-remote";

const ROOT = `0x${"11".repeat(32)}`;
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;
const IDEMPOTENCY_KEY = `checkpoint-v1-${"a".repeat(64)}`;
const ENVELOPE = '{"schemaVersion":1,"ciphertext":"opaque"}';
const BYTE_LENGTH = new TextEncoder().encode(ENVELOPE).byteLength;
const UPLOAD: CheckpointUploadRequest = {
  idempotencyKey: IDEMPOTENCY_KEY,
  encryptedEnvelope: ENVELOPE,
  contentHash: CONTENT_HASH,
  byteLength: BYTE_LENGTH,
};
const DOWNLOAD: CheckpointDownloadRequest = {
  root: ROOT,
  expectedContentHash: CONTENT_HASH,
  expectedByteLength: BYTE_LENGTH,
};

describe("safe browser checkpoint transport", () => {
  it("uploads via same-origin credentials without accepting a wallet or auth token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        receipt: {
          root: ROOT,
          contentHash: CONTENT_HASH,
          byteLength: BYTE_LENGTH,
        },
      }),
    );
    const remote = createCheckpointHttpRemoteStorage({
      fetch: fetcher as typeof fetch,
    });

    await expect(remote.upload(UPLOAD)).resolves.toEqual({
      root: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: BYTE_LENGTH,
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/checkpoints");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(init.headers).get("idempotency-key")).toBe(
      IDEMPOTENCY_KEY,
    );
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: 1,
      operation: "upload",
      ...UPLOAD,
    });
    expect(JSON.stringify(init)).not.toMatch(/wallet|private.?key|bearer/iu);
  });

  it("requests an adult-authorized restore using only proof metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        checkpoint: {
          root: ROOT,
          contentHash: CONTENT_HASH,
          byteLength: BYTE_LENGTH,
          encryptedEnvelope: ENVELOPE,
        },
      }),
    );
    const remote = createCheckpointHttpRemoteStorage({
      fetch: fetcher as typeof fetch,
    });

    await expect(remote.download(DOWNLOAD)).resolves.toEqual({
      root: ROOT,
      contentHash: CONTENT_HASH,
      byteLength: BYTE_LENGTH,
      encryptedEnvelope: ENVELOPE,
    });
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: 1,
      operation: "download",
      ...DOWNLOAD,
    });
    expect(new Headers(init.headers).has("idempotency-key")).toBe(false);
  });

  it.each([
    [429, "rate_limited", true],
    [503, "storage_unavailable", true],
    [422, "checkpoint_rejected", false],
  ] as const)(
    "preserves the server's bounded retry contract for HTTP %s",
    async (status, code, retryable) => {
      const remote = createCheckpointHttpRemoteStorage({
        fetch: vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ ok: false, code, retryable }, status),
          ) as typeof fetch,
      });

      await expect(remote.upload(UPLOAD)).rejects.toEqual(
        new CheckpointRemoteError(code, retryable),
      );
    },
  );

  it("treats network failures as retryable and malformed successes as terminal", async () => {
    const offline = createCheckpointHttpRemoteStorage({
      fetch: vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch,
    });
    const malformed = createCheckpointHttpRemoteStorage({
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ok: true, root: ROOT }),
        ) as typeof fetch,
    });

    await expect(offline.upload(UPLOAD)).rejects.toEqual(
      new CheckpointRemoteError("network_failure", true),
    );
    await expect(malformed.upload(UPLOAD)).rejects.toEqual(
      new CheckpointRemoteError("invalid_response", false),
    );
  });

  it("rejects cross-origin endpoints and oversized responses", async () => {
    for (const endpoint of [
      "https://evil.example/checkpoints",
      "//evil.example/checkpoints",
      "/\\evil.example/checkpoints",
      "/api/checkpoints?redirect=//evil.example",
    ]) {
      expect(() => createCheckpointHttpRemoteStorage({ endpoint })).toThrow(
        "same-origin",
      );
    }
    const fetcher = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-length": "7100001" },
      }),
    );
    const remote = createCheckpointHttpRemoteStorage({
      fetch: fetcher as typeof fetch,
    });

    await expect(remote.upload(UPLOAD)).rejects.toEqual(
      new CheckpointRemoteError("invalid_response", false),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}

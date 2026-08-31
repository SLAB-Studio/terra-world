import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import test from "node:test";

import {
  jsonRpcRequest,
  loadStorageMainnetManifest,
  runStorageMainnetPreflight,
  StorageMainnetPreflightError,
  validateStorageMainnetManifest,
} from "./preflight-storage-mainnet.mjs";

const FLOW = "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526";
const RPC = "https://evmrpc.0g.ai";
const INDEXER = "https://indexer-storage-turbo.0g.ai";
const NODE_A = "https://storage-a.example";
const NODE_B = "http://203.0.113.20:5678";

test("checked-in manifest matches the reviewed official mainnet deployment", async () => {
  const manifest = await loadStorageMainnetManifest();
  assert.equal(manifest.chainId, 16661);
  assert.equal(manifest.rpcUrl, RPC);
  assert.equal(manifest.indexerUrl, INDEXER);
  assert.equal(manifest.flowAddress, FLOW);
  assert.equal(
    manifest.provenance.documentation.source,
    "https://docs.0g.ai/developer-hub/mainnet/mainnet-overview",
  );
  assert.deepEqual(manifest.provenance.liveVerification.chainRpcMethods, [
    "eth_chainId",
    "eth_getCode",
  ]);
  assert.equal(
    manifest.provenance.liveVerification.indexerMethod,
    "indexer_getShardedNodes",
  );
  assert.equal(
    manifest.provenance.liveVerification.trustedNodeMethod,
    "zgs_getStatus",
  );
});

test("passes only after every distinct trusted node agrees on chain and Flow", async () => {
  const manifest = await loadStorageMainnetManifest();
  const calls = [];
  const rpcCall = async (url, method, params, options) => {
    calls.push({ url, method, params, options });
    if (url === RPC && method === "eth_chainId") return "0x4115";
    if (url === RPC && method === "eth_getCode") return "0x60016000";
    if (url === INDEXER && method === "indexer_getShardedNodes") {
      return {
        trusted: [{ url: NODE_A }, { url: NODE_B }],
        discovered: [],
      };
    }
    if ((url === NODE_A || url === NODE_B) && method === "zgs_getStatus") {
      return { networkIdentity: { chainId: 16661, flowAddress: FLOW } };
    }
    throw new Error(`unexpected call ${method} ${url}`);
  };

  const result = await runStorageMainnetPreflight(manifest, {
    rpcCall,
    now: () => new Date("2026-09-01T12:00:00.000Z"),
  });

  assert.deepEqual(result, {
    ok: true,
    deploymentId: "0g-storage-mainnet-2026-09-01",
    checkedAt: "2026-09-01T12:00:00.000Z",
    chainId: 16661,
    rpcUrl: RPC,
    indexerUrl: INDEXER,
    flowAddress: FLOW,
    trustedNodeCount: 2,
  });
  assert.deepEqual(
    calls.map(({ method }) => method).sort(),
    [
      "eth_chainId",
      "eth_getCode",
      "indexer_getShardedNodes",
      "zgs_getStatus",
      "zgs_getStatus",
    ].sort(),
  );
  assert.ok(calls.every(({ options }) => options.timeoutMs === 8_000));
  assert.deepEqual(calls[1].params, [FLOW, "latest"]);
});

test("rejects a chain mismatch and empty Flow bytecode", async (t) => {
  const manifest = await loadStorageMainnetManifest();
  await t.test("chain mismatch", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: async (_url, method) => {
          if (method === "eth_chainId") return "0x1";
          throw new Error("must stop after chain mismatch");
        },
      }),
      errorWithCode("CHAIN_MISMATCH"),
    );
  });
  await t.test("empty bytecode", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: async (_url, method) => {
          if (method === "eth_chainId") return "0x4115";
          if (method === "eth_getCode") return "0x";
          throw new Error("must stop before indexer discovery");
        },
      }),
      errorWithCode("FLOW_CODE_MISSING"),
    );
  });
});

test("rejects missing consensus or a trusted-node identity mismatch", async (t) => {
  const manifest = await loadStorageMainnetManifest();
  await t.test("only one trusted node", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: baseRpc({ trusted: [{ url: NODE_A }] }),
      }),
      errorWithCode("INVALID_INDEXER_RESPONSE"),
    );
  });
  await t.test("duplicate trusted node", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: baseRpc({ trusted: [{ url: NODE_A }, { url: NODE_A }] }),
      }),
      errorWithCode("INVALID_INDEXER_RESPONSE"),
    );
  });
  await t.test("wrong Flow", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: baseRpc(
          { trusted: [{ url: NODE_A }, { url: NODE_B }] },
          { [NODE_B]: { chainId: 16661, flowAddress: `0x${"12".repeat(20)}` } },
        ),
      }),
      errorWithCode("TRUSTED_NODE_FLOW_MISMATCH"),
    );
  });
  await t.test("wrong chain", async () => {
    await assert.rejects(
      runStorageMainnetPreflight(manifest, {
        rpcCall: baseRpc(
          { trusted: [{ url: NODE_A }, { url: NODE_B }] },
          { [NODE_A]: { chainId: 1, flowAddress: FLOW } },
        ),
      }),
      errorWithCode("TRUSTED_NODE_CHAIN_MISMATCH"),
    );
  });
});

test("manifest validation rejects endpoint drift and unexpected secret fields", async () => {
  const manifest = await loadStorageMainnetManifest();
  assert.throws(
    () => validateStorageMainnetManifest({ ...manifest, rpcUrl: `${RPC}/rpc` }),
    errorWithCode("INVALID_MANIFEST"),
  );
  assert.throws(
    () =>
      validateStorageMainnetManifest({
        ...manifest,
        sponsorPrivateKey: `0x${"ab".repeat(32)}`,
      }),
    errorWithCode("INVALID_MANIFEST"),
  );
});

test("JSON-RPC client is bounded and never exposes remote error text", async (t) => {
  await t.test("connection deadline", async () => {
    const fetchImpl = async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    await assert.rejects(
      jsonRpcRequest(RPC, "eth_chainId", [], { timeoutMs: 5, fetchImpl }),
      errorWithCode("REQUEST_TIMEOUT"),
    );
  });
  await t.test("response-body deadline", async () => {
    const fetchImpl = async (_url, { signal }) => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          signal.addEventListener(
            "abort",
            () => controller.error(signal.reason),
            { once: true },
          );
        },
      }),
    });
    await assert.rejects(
      jsonRpcRequest(RPC, "eth_chainId", [], { timeoutMs: 5, fetchImpl }),
      errorWithCode("REQUEST_TIMEOUT"),
    );
  });
  await t.test("response size limit", async () => {
    const fetchImpl = async () => ({
      ok: true,
      headers: { get: () => "1000001" },
      text: async () => {
        throw new Error("oversized body must not be read");
      },
    });
    await assert.rejects(
      jsonRpcRequest(RPC, "eth_chainId", [], { fetchImpl }),
      errorWithCode("INVALID_RESPONSE"),
    );
  });
  await t.test("sanitized JSON-RPC error", async () => {
    const secret = "remote-error-includes-a-private-key";
    const fetchImpl = async () =>
      response({ jsonrpc: "2.0", id: 1, error: { message: secret } });
    await assert.rejects(
      jsonRpcRequest(RPC, "eth_chainId", [], { fetchImpl }),
      (error) =>
        error instanceof StorageMainnetPreflightError &&
        error.code === "INVALID_RESPONSE" &&
        !error.message.includes(secret),
    );
  });
});

function baseRpc(nodes, identityOverrides = {}) {
  return async (url, method) => {
    if (url === RPC && method === "eth_chainId") return "0x4115";
    if (url === RPC && method === "eth_getCode") return "0x6000";
    if (url === INDEXER && method === "indexer_getShardedNodes") return nodes;
    if (method === "zgs_getStatus") {
      return {
        networkIdentity: identityOverrides[url] ?? {
          chainId: 16661,
          flowAddress: FLOW,
        },
      };
    }
    throw new Error(`unexpected call ${method} ${url}`);
  };
}

function response(body) {
  return {
    ok: true,
    text: async () => JSON.stringify(body),
  };
}

function errorWithCode(code) {
  return (error) =>
    error instanceof StorageMainnetPreflightError && error.code === code;
}

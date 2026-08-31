#!/usr/bin/env node
/* global AbortController */

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { pathToFileURL, URL } from "node:url";
import { TextDecoder } from "node:util";

const MANIFEST_URL = new URL(
  "../../packages/zero-g/deployments/storage-mainnet.v1.json",
  import.meta.url,
);
const EXPECTED = Object.freeze({
  schemaVersion: 1,
  deploymentId: "0g-storage-mainnet-2026-09-01",
  network: "0g-mainnet",
  chainId: 16661,
  rpcUrl: "https://evmrpc.0g.ai",
  indexerUrl: "https://indexer-storage-turbo.0g.ai",
  flowAddress: "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526",
  reviewedAt: "2026-09-01",
  documentationSource:
    "https://docs.0g.ai/developer-hub/mainnet/mainnet-overview",
  documentationAssertions: Object.freeze([
    "The official mainnet overview publishes chain ID 16661",
    "The official mainnet overview publishes RPC https://evmrpc.0g.ai",
    "The official mainnet overview publishes Storage indexer https://indexer-storage-turbo.0g.ai",
    "The official mainnet overview publishes Storage Flow 0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  ]),
  liveVerifiedAt: "2026-08-31T23:10:44.236Z",
  liveAssertions: Object.freeze([
    "eth_chainId returned 0x4115",
    "eth_getCode returned non-empty bytecode at the pinned Storage Flow address",
    "All 4 distinct trusted nodes reported chain ID 16661 and the pinned Storage Flow address",
  ]),
});
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const BYTECODE = /^0x(?:[0-9a-fA-F]{2})+$/u;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TRUSTED_NODES = 64;
const MIN_TRUSTED_NODES = 2;
const REQUEST_TIMEOUT_MS = 8_000;

export class StorageMainnetPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StorageMainnetPreflightError";
    this.code = code;
  }
}

export async function loadStorageMainnetManifest(manifestUrl = MANIFEST_URL) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestUrl, "utf8"));
  } catch {
    fail("INVALID_MANIFEST", "Storage mainnet manifest is unreadable");
  }
  return validateStorageMainnetManifest(parsed);
}

export function validateStorageMainnetManifest(value) {
  assertPlainRecord(value, "INVALID_MANIFEST", "Manifest must be an object");
  assertExactKeys(
    value,
    [
      "chainId",
      "deploymentId",
      "flowAddress",
      "indexerUrl",
      "network",
      "provenance",
      "reviewedAt",
      "rpcUrl",
      "schemaVersion",
    ],
    "manifest",
  );
  if (
    value.schemaVersion !== EXPECTED.schemaVersion ||
    value.network !== EXPECTED.network ||
    value.chainId !== EXPECTED.chainId ||
    value.rpcUrl !== EXPECTED.rpcUrl ||
    value.indexerUrl !== EXPECTED.indexerUrl ||
    normalizeAddress(value.flowAddress, "INVALID_MANIFEST") !==
      EXPECTED.flowAddress ||
    value.deploymentId !== EXPECTED.deploymentId ||
    value.reviewedAt !== EXPECTED.reviewedAt
  ) {
    fail(
      "INVALID_MANIFEST",
      "Storage mainnet manifest does not match the reviewed deployment",
    );
  }
  validateExactOfficialUrl(value.rpcUrl, EXPECTED.rpcUrl, "RPC");
  validateExactOfficialUrl(value.indexerUrl, EXPECTED.indexerUrl, "indexer");

  assertPlainRecord(
    value.provenance,
    "INVALID_MANIFEST",
    "Manifest provenance must be an object",
  );
  assertExactKeys(
    value.provenance,
    ["documentation", "liveVerification"],
    "manifest provenance",
  );
  assertPlainRecord(
    value.provenance.documentation,
    "INVALID_MANIFEST",
    "Manifest documentation provenance must be an object",
  );
  assertExactKeys(
    value.provenance.documentation,
    ["assertions", "retrievedAt", "source"],
    "manifest documentation provenance",
  );
  if (
    value.provenance.documentation.source !== EXPECTED.documentationSource ||
    value.provenance.documentation.retrievedAt !== EXPECTED.reviewedAt ||
    !exactStringArray(
      value.provenance.documentation.assertions,
      EXPECTED.documentationAssertions,
    )
  ) {
    fail("INVALID_MANIFEST", "Manifest documentation provenance is incomplete");
  }
  assertPlainRecord(
    value.provenance.liveVerification,
    "INVALID_MANIFEST",
    "Manifest live verification provenance must be an object",
  );
  assertExactKeys(
    value.provenance.liveVerification,
    [
      "assertions",
      "chainRpcMethods",
      "indexerMethod",
      "networkIdentityFields",
      "trustedNodeMethod",
      "verifiedAt",
    ],
    "manifest live verification provenance",
  );
  if (
    value.provenance.liveVerification.verifiedAt !== EXPECTED.liveVerifiedAt ||
    !exactStringArray(value.provenance.liveVerification.chainRpcMethods, [
      "eth_chainId",
      "eth_getCode",
    ]) ||
    value.provenance.liveVerification.indexerMethod !==
      "indexer_getShardedNodes" ||
    value.provenance.liveVerification.trustedNodeMethod !== "zgs_getStatus" ||
    !exactStringArray(value.provenance.liveVerification.networkIdentityFields, [
      "chainId",
      "flowAddress",
    ]) ||
    !exactStringArray(
      value.provenance.liveVerification.assertions,
      EXPECTED.liveAssertions,
    )
  ) {
    fail(
      "INVALID_MANIFEST",
      "Manifest live verification provenance is incomplete",
    );
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    deploymentId: value.deploymentId,
    network: value.network,
    chainId: value.chainId,
    rpcUrl: value.rpcUrl,
    indexerUrl: value.indexerUrl,
    flowAddress: normalizeAddress(value.flowAddress, "INVALID_MANIFEST"),
    reviewedAt: value.reviewedAt,
    provenance: Object.freeze({
      documentation: Object.freeze({
        source: value.provenance.documentation.source,
        retrievedAt: value.provenance.documentation.retrievedAt,
        assertions: Object.freeze([
          ...value.provenance.documentation.assertions,
        ]),
      }),
      liveVerification: Object.freeze({
        verifiedAt: value.provenance.liveVerification.verifiedAt,
        chainRpcMethods: Object.freeze([
          ...value.provenance.liveVerification.chainRpcMethods,
        ]),
        indexerMethod: value.provenance.liveVerification.indexerMethod,
        trustedNodeMethod: value.provenance.liveVerification.trustedNodeMethod,
        networkIdentityFields: Object.freeze([
          ...value.provenance.liveVerification.networkIdentityFields,
        ]),
        assertions: Object.freeze([
          ...value.provenance.liveVerification.assertions,
        ]),
      }),
    }),
  });
}

export async function runStorageMainnetPreflight(manifest, dependencies = {}) {
  const reviewed = validateStorageMainnetManifest(manifest);
  const rpcCall = dependencies.rpcCall ?? jsonRpcRequest;
  const now = dependencies.now ?? (() => new Date());
  const requestOptions = Object.freeze({ timeoutMs: REQUEST_TIMEOUT_MS });

  const chainId = parseChainId(
    await rpcCall(reviewed.rpcUrl, "eth_chainId", [], requestOptions),
    "chain RPC",
  );
  if (chainId !== reviewed.chainId) {
    fail(
      "CHAIN_MISMATCH",
      `Chain RPC reports ${chainId}; expected ${reviewed.chainId}`,
    );
  }

  const code = await rpcCall(
    reviewed.rpcUrl,
    "eth_getCode",
    [reviewed.flowAddress, "latest"],
    requestOptions,
  );
  if (!isNonEmptyBytecode(code)) {
    fail(
      "FLOW_CODE_MISSING",
      "Pinned Storage Flow address has no contract bytecode",
    );
  }

  const shardedNodes = await rpcCall(
    reviewed.indexerUrl,
    "indexer_getShardedNodes",
    [],
    requestOptions,
  );
  const trustedNodeUrls = parseTrustedNodeUrls(shardedNodes);
  const statuses = await Promise.all(
    trustedNodeUrls.map(async (url) => ({
      url,
      status: await rpcCall(url, "zgs_getStatus", [], requestOptions),
    })),
  );

  for (const { url, status } of statuses) {
    const identity = parseNetworkIdentity(status, url);
    if (identity.chainId !== reviewed.chainId) {
      fail(
        "TRUSTED_NODE_CHAIN_MISMATCH",
        `Trusted storage node reports chain ${identity.chainId}; expected ${reviewed.chainId}`,
      );
    }
    if (identity.flowAddress !== reviewed.flowAddress) {
      fail(
        "TRUSTED_NODE_FLOW_MISMATCH",
        "Trusted storage node reports a different Flow contract",
      );
    }
  }

  const checkedAt = now();
  if (!(checkedAt instanceof Date) || Number.isNaN(checkedAt.valueOf())) {
    fail("INVALID_CLOCK", "Preflight clock returned an invalid date");
  }
  return Object.freeze({
    ok: true,
    deploymentId: reviewed.deploymentId,
    checkedAt: checkedAt.toISOString(),
    chainId: reviewed.chainId,
    rpcUrl: reviewed.rpcUrl,
    indexerUrl: reviewed.indexerUrl,
    flowAddress: reviewed.flowAddress,
    trustedNodeCount: trustedNodeUrls.length,
  });
}

export async function jsonRpcRequest(url, method, params = [], options = {}) {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (
    typeof fetchImpl !== "function" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30_000
  ) {
    fail("INVALID_REQUEST", "JSON-RPC request configuration is invalid");
  }
  validateRpcTarget(url);
  if (typeof method !== "string" || !/^[a-z][A-Za-z0-9_]+$/u.test(method)) {
    fail("INVALID_REQUEST", "JSON-RPC method is invalid");
  }
  if (!Array.isArray(params)) {
    fail("INVALID_REQUEST", "JSON-RPC params must be an array");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let text;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "terra-world-storage-preflight/1",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response || response.ok !== true) {
      fail("REQUEST_FAILED", `${method} returned a non-success HTTP response`);
    }
    text = await readBoundedResponse(response, method);
  } catch (error) {
    if (controller.signal.aborted) {
      fail("REQUEST_TIMEOUT", `${method} exceeded its ${timeoutMs}ms deadline`);
    }
    if (error instanceof StorageMainnetPreflightError) {
      throw error;
    }
    fail("REQUEST_FAILED", `${method} request failed`);
  } finally {
    clearTimeout(timeout);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail("INVALID_RESPONSE", `${method} returned invalid JSON`);
  }
  if (
    !isPlainRecord(body) ||
    body.jsonrpc !== "2.0" ||
    body.id !== 1 ||
    "error" in body ||
    !("result" in body)
  ) {
    fail("INVALID_RESPONSE", `${method} returned an invalid JSON-RPC envelope`);
  }
  return body.result;
}

function parseTrustedNodeUrls(value) {
  assertPlainRecord(
    value,
    "INVALID_INDEXER_RESPONSE",
    "Indexer sharded-node response must be an object",
  );
  if (
    !Array.isArray(value.trusted) ||
    value.trusted.length < MIN_TRUSTED_NODES ||
    value.trusted.length > MAX_TRUSTED_NODES
  ) {
    fail(
      "INVALID_INDEXER_RESPONSE",
      `Indexer must return between ${MIN_TRUSTED_NODES} and ${MAX_TRUSTED_NODES} trusted nodes`,
    );
  }
  const urls = value.trusted.map((node) => {
    assertPlainRecord(
      node,
      "INVALID_INDEXER_RESPONSE",
      "Trusted node entry must be an object",
    );
    if (typeof node.url !== "string") {
      fail("INVALID_INDEXER_RESPONSE", "Trusted node URL is missing");
    }
    validateRpcTarget(node.url);
    return new URL(node.url).toString().replace(/\/$/u, "");
  });
  if (new Set(urls).size !== urls.length) {
    fail(
      "INVALID_INDEXER_RESPONSE",
      "Indexer returned duplicate trusted nodes",
    );
  }
  return Object.freeze(urls);
}

function parseNetworkIdentity(value, nodeUrl) {
  assertPlainRecord(
    value,
    "INVALID_NODE_RESPONSE",
    "Trusted storage node returned an invalid status",
  );
  assertPlainRecord(
    value.networkIdentity,
    "INVALID_NODE_RESPONSE",
    "Trusted storage node status has no network identity",
  );
  return Object.freeze({
    chainId: parseChainId(value.networkIdentity.chainId, nodeUrl),
    flowAddress: normalizeAddress(
      value.networkIdentity.flowAddress,
      "INVALID_NODE_RESPONSE",
    ),
  });
}

function parseChainId(value, source) {
  let chainId;
  if (typeof value === "number") {
    chainId = value;
  } else if (typeof value === "string" && /^0x[0-9a-fA-F]+$/u.test(value)) {
    chainId = Number.parseInt(value.slice(2), 16);
  } else if (typeof value === "string" && /^\d+$/u.test(value)) {
    chainId = Number.parseInt(value, 10);
  }
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    fail("INVALID_RESPONSE", `${source} returned an invalid chain ID`);
  }
  return chainId;
}

function normalizeAddress(value, code = "INVALID_RESPONSE") {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    fail(code, "Storage Flow address is invalid");
  }
  return value.toLowerCase();
}

async function readBoundedResponse(response, method) {
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    fail("INVALID_RESPONSE", `${method} response exceeded the size limit`);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    let text;
    try {
      text = await response.text();
    } catch {
      fail("INVALID_RESPONSE", `${method} returned an unreadable response`);
    }
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      fail("INVALID_RESPONSE", `${method} response exceeded the size limit`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        fail("INVALID_RESPONSE", `${method} returned an unreadable response`);
      }
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        fail("INVALID_RESPONSE", `${method} response exceeded the size limit`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof StorageMainnetPreflightError) throw error;
    fail("INVALID_RESPONSE", `${method} returned an unreadable response`);
  } finally {
    reader.releaseLock();
  }
}

function isNonEmptyBytecode(value) {
  return (
    typeof value === "string" && BYTECODE.test(value) && !/^0x0+$/u.test(value)
  );
}

function validateExactOfficialUrl(value, expected, label) {
  if (value !== expected) {
    fail(
      "INVALID_MANIFEST",
      `${label} URL is not the reviewed official endpoint`,
    );
  }
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("INVALID_MANIFEST", `${label} URL is not an exact HTTPS origin`);
  }
}

function validateRpcTarget(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_RPC_TARGET", "RPC target is not a valid URL");
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    fail("INVALID_RPC_TARGET", "RPC target is not an allowed HTTP endpoint");
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail("INVALID_MANIFEST", `${label} contains unexpected or missing fields`);
  }
}

function exactStringArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function assertPlainRecord(value, code, message) {
  if (!isPlainRecord(value)) fail(code, message);
}

function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(code, message) {
  throw new StorageMainnetPreflightError(code, message);
}

async function main() {
  if (process.argv.length !== 2) {
    fail(
      "INVALID_ARGUMENT",
      "This preflight accepts no command-line arguments",
    );
  }
  const manifest = await loadStorageMainnetManifest();
  const result = await runStorageMainnetPreflight(manifest);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    const code =
      error instanceof StorageMainnetPreflightError
        ? error.code
        : "UNEXPECTED_FAILURE";
    const message =
      error instanceof StorageMainnetPreflightError
        ? error.message
        : "Storage mainnet preflight failed unexpectedly";
    process.stderr.write(`0G Storage preflight failed [${code}]: ${message}\n`);
    process.exitCode = 1;
  });
}

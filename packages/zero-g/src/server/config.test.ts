import { describe, expect, it } from "vitest";

import {
  isZeroGRequired,
  loadZeroGChainConfig,
  loadZeroGComputeConfig,
  loadZeroGServerConfig,
  loadZeroGStorageConfig,
  ZeroGConfigError,
} from "./index";

const TEST_PRIVATE_KEY = `0x${"12".repeat(32)}`;

const validTestnetEnvironment = {
  ZERO_G_NETWORK: "testnet",
  ZERO_G_COMPUTE_API_KEY: "sk-test-key-12345",
  ZERO_G_COMPUTE_MODEL: "private-model-from-live-catalog",
  ZERO_G_SPONSOR_PRIVATE_KEY: TEST_PRIVATE_KEY,
};

describe("loadZeroGServerConfig", () => {
  it("loads a private, TEE-verified testnet configuration", () => {
    expect(loadZeroGServerConfig(validTestnetEnvironment)).toMatchObject({
      network: "testnet",
      chainId: 16602,
      compute: {
        baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
        apiKey: "sk-test-key-12345",
        trustMode: "private",
        verifyTee: true,
      },
      request: { timeoutMs: 12_000, maxRetries: 2 },
      storage: {
        indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
        flowAddress: "0x22e03a6a89b950f1c82ec5e74f8eca321a105296",
        uploadTimeoutMs: 300_000,
      },
    });
  });

  it.each([
    "ZERO_G_COMPUTE_API_KEY",
    "ZERO_G_COMPUTE_MODEL",
    "ZERO_G_SPONSOR_PRIVATE_KEY",
  ])("fails closed when %s is missing", (field) => {
    const environment = { ...validTestnetEnvironment, [field]: undefined };
    expect(() => loadZeroGServerConfig(environment)).toThrowError(
      expect.objectContaining<Partial<ZeroGConfigError>>({
        name: "ZeroGConfigError",
        code: "MISSING_VALUE",
        field,
      }),
    );
  });

  it("defaults service-specific configuration to mainnet", () => {
    expect(loadZeroGChainConfig({})).toMatchObject({
      network: "mainnet",
      chainId: 16661,
      chainRpcUrl: "https://evmrpc.0g.ai",
    });
    expect(
      loadZeroGComputeConfig({
        ZERO_G_COMPUTE_API_KEY: "app-sk-mainnet-key",
        ZERO_G_COMPUTE_MODEL: "mainnet-model",
      }),
    ).toMatchObject({
      network: "mainnet",
      required: false,
      compute: {
        baseUrl: "https://router-api.0g.ai/v1",
        providerSort: "price",
        allowProviderFallbacks: false,
      },
    });
  });

  it("loads Storage without Compute credentials or a wallet", () => {
    expect(loadZeroGStorageConfig({ ZERO_G_NETWORK: "testnet" })).toMatchObject(
      {
        network: "testnet",
        chainId: 16602,
        storage: {
          indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
          flowAddress: "0x22e03a6a89b950f1c82ec5e74f8eca321a105296",
          uploadTimeoutMs: 300_000,
        },
      },
    );
    expect(loadZeroGStorageConfig({ ZERO_G_NETWORK: "mainnet" })).toMatchObject(
      {
        network: "mainnet",
        chainId: 16661,
        storage: {
          indexerUrl: "https://indexer-storage-turbo.0g.ai",
          flowAddress: "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526",
        },
      },
    );
  });

  it("uses an exact, validated opt-in for strict 0G routes", () => {
    expect(isZeroGRequired({})).toBe(false);
    expect(isZeroGRequired({ ZERO_G_REQUIRED: "true" })).toBe(true);
    expect(isZeroGRequired({ ZERO_G_REQUIRED: "FALSE" })).toBe(false);
    expect(() => isZeroGRequired({ ZERO_G_REQUIRED: "yes" })).toThrowError(
      expect.objectContaining({ field: "ZERO_G_REQUIRED" }),
    );
  });

  it("rejects a management key for inference", () => {
    expect(() =>
      loadZeroGServerConfig({
        ...validTestnetEnvironment,
        ZERO_G_COMPUTE_API_KEY: "mk-management-key",
      }),
    ).toThrowError(
      expect.objectContaining({ field: "ZERO_G_COMPUTE_API_KEY" }),
    );
  });

  it("rejects insecure endpoints and cross-network Router endpoints", () => {
    expect(() =>
      loadZeroGServerConfig({
        ...validTestnetEnvironment,
        ZERO_G_CHAIN_RPC_URL: "http://localhost:8545",
      }),
    ).toThrowError(expect.objectContaining({ code: "INSECURE_URL" }));

    expect(() =>
      loadZeroGServerConfig({
        ...validTestnetEnvironment,
        ZERO_G_COMPUTE_ROUTER_URL: "https://router-api.0g.ai/v1",
      }),
    ).toThrowError(expect.objectContaining({ code: "NETWORK_MISMATCH" }));

    expect(() =>
      loadZeroGStorageConfig({
        ZERO_G_NETWORK: "mainnet",
        ZERO_G_CHAIN_RPC_URL: "https://rpc.attacker.example",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "NETWORK_MISMATCH",
        field: "ZERO_G_CHAIN_RPC_URL",
      }),
    );
    expect(() =>
      loadZeroGStorageConfig({
        ZERO_G_NETWORK: "mainnet",
        ZERO_G_STORAGE_INDEXER_URL:
          "https://indexer-storage-testnet-turbo.0g.ai",
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "NETWORK_MISMATCH",
        field: "ZERO_G_STORAGE_INDEXER_URL",
      }),
    );
  });

  it.each([
    [
      "ZERO_G_CHAIN_RPC_URL",
      "https://user:pass@evmrpc.0g.ai",
      () => loadZeroGChainConfig,
    ],
    [
      "ZERO_G_CHAIN_RPC_URL",
      "https://evmrpc.0g.ai:444",
      () => loadZeroGChainConfig,
    ],
    [
      "ZERO_G_CHAIN_RPC_URL",
      "https://evmrpc.0g.ai/rpc",
      () => loadZeroGChainConfig,
    ],
    [
      "ZERO_G_COMPUTE_ROUTER_URL",
      "https://router-api.0g.ai/v1?key=value",
      () => loadZeroGComputeConfig,
    ],
    [
      "ZERO_G_COMPUTE_ROUTER_URL",
      "https://router-api.0g.ai/v2",
      () => loadZeroGComputeConfig,
    ],
    [
      "ZERO_G_STORAGE_INDEXER_URL",
      "https://indexer-storage-turbo.0g.ai/#fragment",
      () => loadZeroGStorageConfig,
    ],
  ] as const)(
    "rejects a non-exact official endpoint in %s",
    (field, url, loaderFactory) => {
      const loader = loaderFactory();
      const environment = {
        ZERO_G_COMPUTE_API_KEY: "app-sk-mainnet-key",
        ZERO_G_COMPUTE_MODEL: "mainnet-model",
        [field]: url,
      };
      expect(() => loader(environment)).toThrowError(
        expect.objectContaining({ code: "NETWORK_MISMATCH", field }),
      );
    },
  );

  it("rejects invalid request limits", () => {
    expect(() =>
      loadZeroGServerConfig({
        ...validTestnetEnvironment,
        ZERO_G_REQUEST_TIMEOUT_MS: "30001",
      }),
    ).toThrowError(
      expect.objectContaining({ field: "ZERO_G_REQUEST_TIMEOUT_MS" }),
    );
    expect(() =>
      loadZeroGStorageConfig({
        ZERO_G_STORAGE_UPLOAD_TIMEOUT_MS: "59999",
      }),
    ).toThrowError(
      expect.objectContaining({ field: "ZERO_G_STORAGE_UPLOAD_TIMEOUT_MS" }),
    );
  });
});

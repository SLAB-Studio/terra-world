import { describe, expect, it } from "vitest";

import { loadZeroGServerConfig, ZeroGConfigError } from "./index";

const TEST_PRIVATE_KEY = `0x${"12".repeat(32)}`;

const validTestnetEnvironment = {
  ZERO_G_NETWORK: "testnet",
  ZERO_G_COMPUTE_API_KEY: "sk-test-key-12345",
  ZERO_G_COMPUTE_MODEL: "private-model-from-live-catalog",
  ZERO_G_SPONSOR_PRIVATE_KEY: TEST_PRIVATE_KEY,
  ZERO_G_STORAGE_INDEXER_URL: "https://indexer.testnet.example",
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
    });
  });

  it.each([
    "ZERO_G_NETWORK",
    "ZERO_G_COMPUTE_API_KEY",
    "ZERO_G_COMPUTE_MODEL",
    "ZERO_G_SPONSOR_PRIVATE_KEY",
    "ZERO_G_STORAGE_INDEXER_URL",
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
  });

  it("rejects invalid request limits", () => {
    expect(() =>
      loadZeroGServerConfig({
        ...validTestnetEnvironment,
        ZERO_G_REQUEST_TIMEOUT_MS: "30001",
      }),
    ).toThrowError(
      expect.objectContaining({ field: "ZERO_G_REQUEST_TIMEOUT_MS" }),
    );
  });
});

import { describe, expect, it } from "vitest";

import { createProofGetHandler, createTerraProofSnapshot } from "./server";

const HASH = `0x${"a".repeat(64)}`;
const ADDRESS = `0x${"b".repeat(40)}`;

describe("public Terra World proof snapshot", () => {
  it("accepts current app-scoped Router inference keys", () => {
    const snapshot = createTerraProofSnapshot({
      ZERO_G_NETWORK: "mainnet",
      ZERO_G_COMPUTE_API_KEY: "app-sk-private-mainnet-key",
      ZERO_G_COMPUTE_MODEL: "private-mainnet-model",
    });

    expect(snapshot.compute.state).toBe("configured");
  });

  it("reports honest unconfigured states without returning secret fields", () => {
    const snapshot = createTerraProofSnapshot({});

    expect(snapshot.campaign.storageState).toBe("unconfigured");
    expect(snapshot.compute.state).toBe("unconfigured");
    expect(snapshot.chain.state).toBe("unconfigured");
    expect(snapshot.sponsor).toEqual({
      state: "unconfigured",
      childWalletRequired: false,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/privateKey|apiKey|secret/iu);
  });

  it("returns only public evidence when every deployment value is valid", () => {
    const snapshot = createTerraProofSnapshot({
      ZERO_G_NETWORK: "testnet",
      ZERO_G_COMPUTE_API_KEY: "sk-private-test-key",
      ZERO_G_COMPUTE_MODEL: "tee-model-v1",
      ZERO_G_SPONSOR_PRIVATE_KEY: `0x${"c".repeat(64)}`,
      ZERO_G_RIVERGATE_STORAGE_ROOT: HASH,
      ZERO_G_RIVERGATE_STORAGE_TX_HASH: HASH,
      ZERO_G_CAMPAIGN_REGISTRY_ADDRESS: ADDRESS,
      ZERO_G_CITY_AGENT_ADDRESS: ADDRESS,
    });

    expect(snapshot.campaign).toMatchObject({
      storageState: "configured",
      rootHash: HASH,
      transactionHash: HASH,
    });
    expect(snapshot.compute.state).toBe("configured");
    expect(snapshot.chain).toEqual({
      state: "configured",
      network: "testnet",
      campaignRegistryAddress: ADDRESS,
      cityAgentAddress: ADDRESS,
    });
    expect(snapshot.sponsor.state).toBe("configured");
    expect(JSON.stringify(snapshot)).not.toContain("sk-private-test-key");
    expect(JSON.stringify(snapshot)).not.toContain("c".repeat(64));
  });

  it("fails closed when deployment values are partial or malformed", () => {
    const snapshot = createTerraProofSnapshot({
      ZERO_G_NETWORK: "testnet",
      ZERO_G_COMPUTE_API_KEY: "bad",
      ZERO_G_RIVERGATE_STORAGE_ROOT: HASH,
      ZERO_G_CAMPAIGN_REGISTRY_ADDRESS: "0x1234",
    });

    expect(snapshot.campaign).toMatchObject({
      storageState: "misconfigured",
      rootHash: null,
      transactionHash: null,
    });
    expect(snapshot.compute.state).toBe("misconfigured");
    expect(snapshot.chain).toMatchObject({
      state: "misconfigured",
      campaignRegistryAddress: null,
      cityAgentAddress: null,
    });
  });

  it("serves private no-store JSON", async () => {
    const response = createProofGetHandler({})();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({ schemaVersion: 1 });
  });
});

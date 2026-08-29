import { describe, expect, it } from "vitest";

import { ZERO_G_NETWORKS, getZeroGPublicNetwork } from "./index";

describe("public 0G networks", () => {
  it("keeps Galileo and mainnet in separate environments", () => {
    expect(getZeroGPublicNetwork("testnet")).toMatchObject({
      chainId: 16602,
      computeRouterUrl: "https://router-api-testnet.integratenetwork.work/v1",
    });
    expect(getZeroGPublicNetwork("mainnet")).toMatchObject({
      chainId: 16661,
      computeRouterUrl: "https://router-api.0g.ai/v1",
    });
  });

  it("contains public metadata only", () => {
    const serialized = JSON.stringify(ZERO_G_NETWORKS);
    expect(serialized).not.toMatch(
      /private.?key|api.?key|authorization|bearer/i,
    );
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("0x");
  });
});

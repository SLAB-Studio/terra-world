import { describe, expect, it } from "vitest";

import { houseHelpRequest } from "./house-upgrades-3d";

describe("3D house help bubbles", () => {
  it("asks for the first essential system that is missing", () => {
    expect(houseHelpRequest(["water", "garden", "recycle"])).toBe(
      "Our home is dark!",
    );
    expect(houseHelpRequest(["light", "garden", "recycle"])).toBe(
      "Our garden is thirsty!",
    );
  });

  it("stays quiet when the home is healthy", () => {
    expect(houseHelpRequest(["light", "water", "garden", "recycle"])).toBe(
      null,
    );
  });
});

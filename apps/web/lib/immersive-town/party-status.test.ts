import { describe, expect, it } from "vitest";
import { partyLoadMessage, partyModelStatus } from "./party-status";

describe("walking party loading and recovery", () => {
  it.each([undefined, "loading"])(
    "keeps loading visible when Leo loads before the player (%s)",
    (player) => {
      const status = partyModelStatus(player, "ready");
      expect(status).toBe("loading");
      expect(partyLoadMessage(status)).toContain("both engineers");
    },
  );
  it("names a failed player even when Leo is ready and offers recovery", () => {
    const status = partyModelStatus("fallback", "ready");
    expect(status).toBe("player-failed");
    expect(partyLoadMessage(status)).toContain("Your character couldn’t load");
    expect(partyLoadMessage(status)).toContain("Reload");
  });
  it("names a failed Leo model separately", () => {
    const status = partyModelStatus("ready", "fallback");
    expect(status).toBe("leo-failed");
    expect(partyLoadMessage(status)).toContain("Leo’s model couldn’t load");
  });
  it("clears failure and loading notices only after both assets recover", () => {
    expect(partyModelStatus("fallback", "ready")).toBe("player-failed");
    expect(partyModelStatus("loading", "ready")).toBe("loading");
    expect(partyModelStatus("ready", "loading")).toBe("loading");
    const recovered = partyModelStatus("ready", "ready");
    expect(recovered).toBe("ready");
    expect(partyLoadMessage(recovered)).toBeNull();
  });
});

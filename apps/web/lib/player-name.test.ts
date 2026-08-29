import { describe, expect, it } from "vitest";

import {
  normalisePlayerName,
  playerDisplayName,
  readStoredPlayerName,
} from "./player-name";

describe("player nickname", () => {
  it("keeps friendly names while removing markup and control symbols", () => {
    expect(normalisePlayerName("  Ayo <script>!  ")).toBe("Ayo script");
    expect(normalisePlayerName("Mina-Joy")).toBe("Mina-Joy");
  });

  it("limits the nickname to a child-readable interface length", () => {
    expect(normalisePlayerName("NeighbourhoodSuperBuilder")).toHaveLength(18);
  });

  it("falls back safely when no nickname is stored", () => {
    expect(readStoredPlayerName(null)).toBe("");
    expect(playerDisplayName("  ")).toBe("City Builder");
  });
});

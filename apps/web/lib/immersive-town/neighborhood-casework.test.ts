import { describe, expect, it } from "vitest";
import {
  CASE_HOME_IDS,
  RESIDENT_CASES,
  caseEntry,
  caseStage,
  currentCaseForHome,
  emptyCasework,
  parseCasework,
  reconcileCasework,
  recordCaseEvent,
} from "./neighborhood-casework";
import {
  NEIGHBORHOOD_HOME_PROFILES,
  startingNeighborhoodUpgrades,
} from "./neighborhood-home-stories";

const zara = RESIDENT_CASES.find(
  (item) => item.homeId === "neighborhood-home-0",
)!;

describe("local resident casework", () => {
  it("anchors all 28 homes to existing owners and repair needs", () => {
    expect(CASE_HOME_IDS).toHaveLength(28);
    expect(new Set(RESIDENT_CASES.map((item) => item.key)).size).toBe(
      RESIDENT_CASES.length,
    );
    for (const home of NEIGHBORHOOD_HOME_PROFILES) {
      const item = currentCaseForHome(
        home.id,
        emptyCasework(),
        startingNeighborhoodUpgrades(home.need),
      );
      expect(item).toMatchObject({
        homeId: home.id,
        ownerName: home.ownerName,
        need: home.need,
      });
    }
    expect(new Set(RESIDENT_CASES.map((item) => item.routine)).size).toBe(28);
  });

  it("requires a conversation, actual inspection, installed repair, and follow-up", () => {
    let state = emptyCasework();
    expect(caseStage(zara, state, [])).toBe("meet");
    expect(recordCaseEvent(state, zara.key, "followed-up", [zara.need])).toBe(
      state,
    );
    state = recordCaseEvent(state, zara.key, "met", []);
    expect(caseStage(zara, state, [])).toBe("inspect");
    expect(recordCaseEvent(state, zara.key, "followed-up", [zara.need])).toBe(
      state,
    );
    state = recordCaseEvent(state, zara.key, "inspected", []);
    expect(caseStage(zara, state, [])).toBe("repair");
    expect(recordCaseEvent(state, zara.key, "followed-up", ["water"])).toBe(
      state,
    );
    expect(caseStage(zara, state, [zara.need])).toBe("follow-up");
    state = recordCaseEvent(state, zara.key, "followed-up", [zara.need]);
    expect(caseStage(zara, state, [zara.need])).toBe("complete");
    expect(caseStage(zara, state, [])).toBe("repair");
  });

  it("accepts a repair made before the conversation without inventing completion", () => {
    const inspected = recordCaseEvent(emptyCasework(), zara.key, "inspected", [
      zara.need,
    ]);
    expect(caseStage(zara, inspected, [zara.need])).toBe("meet");
    const met = recordCaseEvent(inspected, zara.key, "met", [zara.need]);
    expect(caseStage(zara, met, [zara.need])).toBe("follow-up");
  });

  it("keeps the inspected core repair selected after installation until check-in", () => {
    const item = currentCaseForHome("sunny", emptyCasework(), [
      "light",
      "garden",
    ])!;
    expect(item.need).toBe("water");
    let state = recordCaseEvent(emptyCasework(), item.key, "met", []);
    state = recordCaseEvent(state, item.key, "inspected", []);
    expect(
      currentCaseForHome("sunny", state, ["light", "garden", "water"])?.key,
    ).toBe(item.key);
    state = recordCaseEvent(state, item.key, "followed-up", ["water"]);
    expect(
      currentCaseForHome("sunny", state, ["light", "garden", "water"])?.need,
    ).toBe("recycle");
  });

  it("invalidates old completion if a changed challenge no longer has the repair", () => {
    let state = recordCaseEvent(emptyCasework(), zara.key, "met", []);
    state = recordCaseEvent(state, zara.key, "inspected", []);
    state = recordCaseEvent(state, zara.key, "followed-up", [zara.need]);
    expect(reconcileCasework(state, { [zara.homeId]: [zara.need] })).toBe(
      state,
    );
    const next = reconcileCasework(state, { [zara.homeId]: [] });
    expect(caseEntry(next, zara.key)).toEqual({
      met: true,
      inspected: false,
      followedUp: false,
    });
    expect(caseStage(zara, next, [zara.need])).toBe("inspect");
  });

  it("round-trips only valid versioned local progress", () => {
    const state = recordCaseEvent(emptyCasework(), zara.key, "met", []);
    expect(parseCasework(JSON.stringify(state))).toEqual(state);
    expect(parseCasework(null)).toEqual(emptyCasework());
    expect(recordCaseEvent(state, "unknown-home:light", "met", [])).toBe(state);
    expect(recordCaseEvent(state, zara.key, "met", [])).toBe(state);
  });

  it.each([
    "{broken",
    "null",
    "[]",
    "false",
    JSON.stringify({ schemaVersion: 2, entries: {} }),
    JSON.stringify({ schemaVersion: 1, entries: [] }),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        "unknown:water": { met: true, inspected: true, followedUp: true },
      },
    }),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        [zara.key]: { met: "yes", inspected: false, followedUp: false },
      },
    }),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        [zara.key]: { met: false, inspected: true, followedUp: true },
      },
    }),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        [zara.key]: { met: true, inspected: false, followedUp: true },
      },
    }),
    JSON.stringify({ schemaVersion: 1, entries: {}, other: true }),
    " ".repeat(64_001),
  ])(
    "rejects malformed or future journal saves without trusting them (%#)",
    (raw) => {
      expect(parseCasework(raw)).toBeNull();
    },
  );
});

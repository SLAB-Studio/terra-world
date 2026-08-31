import { describe, expect, it } from "vitest";
import { createChapterState, reduceChapter } from "../opening-chapter/story";
import { resolveMissionMapGuide } from "./mission-map-guide";

const input = {
  chapter: null,
  chapterPoints: [
    { id: "bridge" as const, position: { x: 10, z: 20 }, radius: 5.2 },
    { id: "maya" as const, position: { x: 30, z: 40 }, radius: 5.2 },
    { id: "malik" as const, position: { x: 50, z: 30 }, radius: 5.2 },
    { id: "nia" as const, position: { x: 5, z: 4 }, radius: 5.2 },
  ],
  repairMission: {
    houseId: "sunny",
    label: "Sunny House",
    instruction: "Restore solar power.",
  },
  houseDoors: [{ id: "sunny", x: -12, z: 4 }],
  freeExploreStatus: "Review changes to continue.",
  visit: null,
};

describe("mission minimap integration rules", () => {
  it("uses the real home door without claiming a route or awarding progress", () => {
    expect(resolveMissionMapGuide(input)).toEqual({
      target: {
        id: "sunny",
        label: "Sunny House",
        instruction: "Restore solar power.",
        position: { x: -12, z: 4 },
        radius: 5.2,
      },
      status: "Restore solar power.",
    });
  });
  it("tracks the chapter ahead of a legacy repair, then the next resident", () => {
    const chapter = reduceChapter(createChapterState(), { type: "skip-intro" });
    expect(resolveMissionMapGuide({ ...input, chapter }).target?.id).toBe(
      "bridge",
    );
    const investigated = reduceChapter(chapter, {
      type: "collect-evidence",
      id: "bridge",
    });
    expect(
      resolveMissionMapGuide({ ...input, chapter: investigated }).target?.id,
    ).toBe("maya");
    expect(chapter.evidence).toEqual([]);
  });
  it("does not leak a repair marker into chapter intro or decision screens", () => {
    expect(
      resolveMissionMapGuide({ ...input, chapter: createChapterState() })
        .target,
    ).toBeNull();
    let chapter = reduceChapter(createChapterState(), { type: "skip-intro" });
    for (const id of ["bridge", "maya", "malik", "nia"] as const) {
      chapter = reduceChapter(chapter, { type: "collect-evidence", id });
    }
    const result = resolveMissionMapGuide({ ...input, chapter });
    expect(result.target).toBeNull();
    expect(result.status).toContain("Choose");
  });
  it("never invents a door position when a destination is missing or invalid", () => {
    expect(
      resolveMissionMapGuide({ ...input, houseDoors: [] }).target,
    ).toBeNull();
    expect(
      resolveMissionMapGuide({
        ...input,
        houseDoors: [{ id: "sunny", x: NaN, z: 2 }],
      }).target,
    ).toBeNull();
    expect(
      resolveMissionMapGuide({ ...input, repairMission: null }).status,
    ).toBe("Review changes to continue.");
  });
  it("keeps exterior mission coordinates while indoors and provides a real next action", () => {
    const ownHome = resolveMissionMapGuide({
      ...input,
      visit: { id: "sunny", name: "Sunny House" },
    });
    expect(ownHome.status).toBe("Inside Sunny House. Find the repair point.");
    expect(ownHome.target?.position).toEqual({ x: -12, z: 4 });
    const elsewhere = resolveMissionMapGuide({
      ...input,
      visit: { id: "cafe", name: "the café" },
    });
    expect(elsewhere.status).toBe("Leave the café to continue outside.");
  });
});

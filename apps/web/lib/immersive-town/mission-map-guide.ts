import {
  getChapterObjective,
  type ChapterState,
  type ChapterEvidenceId,
} from "../opening-chapter/story";
import {
  deriveChapterMapTarget,
  type MapPoint,
  type MissionMapTarget,
} from "./mission-minimap";

export type RepairMapMission = Readonly<{
  houseId: string;
  label: string;
  instruction: string;
}>;

export type MissionMapGuide = Readonly<{
  target: MissionMapTarget | null;
  status: string;
}>;

/** Mission rules own the destination. The minimap never grants progress. */
export function resolveMissionMapGuide(
  input: Readonly<{
    chapter: ChapterState | null;
    chapterPoints: readonly {
      id: ChapterEvidenceId;
      position: MapPoint;
      radius: number;
    }[];
    repairMission: RepairMapMission | null;
    houseDoors: readonly { id: string; x: number; z: number }[];
    freeExploreStatus: string;
    visit: { id: string; name: string } | null;
  }>,
): MissionMapGuide {
  let target: MissionMapTarget | null = null;
  let status = input.freeExploreStatus;
  if (input.chapter) {
    target = deriveChapterMapTarget(input.chapter, input.chapterPoints);
    status = getChapterObjective(input.chapter);
  } else if (input.repairMission) {
    const mission = input.repairMission;
    const door = input.houseDoors.find(
      (candidate) => candidate.id === mission.houseId,
    );
    if (door && Number.isFinite(door.x) && Number.isFinite(door.z)) {
      target = {
        id: mission.houseId,
        label: mission.label,
        instruction: mission.instruction,
        position: { x: door.x, z: door.z },
        radius: 5.2,
      };
    }
    status = mission.instruction;
  }
  if (input.visit) {
    status =
      !input.chapter && input.repairMission?.houseId === input.visit.id
        ? `Inside ${input.visit.name}. Find the repair point.`
        : `Leave ${input.visit.name} to continue outside.`;
  }
  return { target, status };
}

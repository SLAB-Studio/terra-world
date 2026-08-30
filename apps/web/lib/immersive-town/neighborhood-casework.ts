import {
  NEIGHBORHOOD_HOME_PROFILES,
  type NeighborhoodNeed,
} from "./neighborhood-home-stories";

/** Authored, local story state. Installed upgrades remain the repair authority. */
export const CASEWORK_STORAGE_KEY = "terra-world:resident-casework:v1";

export type ResidentCase = Readonly<{
  key: string;
  homeId: string;
  homeName: string;
  ownerName: string;
  need: NeighborhoodNeed;
  title: string;
  request: string;
  routine: string;
  evidence: string;
  feedback: string;
  repairLabel: string;
  location: string;
}>;

export type CaseEntry = Readonly<{
  met: boolean;
  inspected: boolean;
  followedUp: boolean;
}>;

export type CaseworkProgress = Readonly<{
  schemaVersion: 1;
  entries: Readonly<Record<string, CaseEntry>>;
}>;

export type CaseStage =
  "meet" | "inspect" | "repair" | "follow-up" | "complete";
export type CaseEvent = "met" | "inspected" | "followed-up";

const NEED_DETAILS: Readonly<
  Record<
    NeighborhoodNeed,
    Readonly<{
      title: string;
      request: string;
      evidence: string;
      feedback: string;
      repairLabel: string;
      location: string;
    }>
  >
> = {
  light: {
    title: "An evening with the lights on",
    request:
      "The reading corner gets too dark after sunset. Could you check the power before changing anything?",
    evidence:
      "The home has no solar-power upgrade. Check the light in the living room.",
    feedback:
      "The power is back. I can leave my book open instead of putting it away at sunset.",
    repairLabel: "Restore solar power",
    location: "living room",
  },
  water: {
    title: "Water for the everyday things",
    request:
      "The tap sputters, and the plants still need watering. Would you take a look at the kitchen supply?",
    evidence:
      "The home has no clean-water upgrade. Check the supply in the kitchen.",
    feedback:
      "Water reaches the tap and the plants again. The ordinary jobs feel ordinary now.",
    repairLabel: "Repair the water supply",
    location: "kitchen",
  },
  garden: {
    title: "Room for something to grow",
    request:
      "There is space outside, but no garden yet. Can you look at the yard and help us make it useful?",
    evidence:
      "The home has no garden upgrade. Check the planting area in the garden room.",
    feedback:
      "There is a proper growing space now. I will have somewhere to tend the plants when I get home.",
    repairLabel: "Restore the garden",
    location: "garden room",
  },
  recycle: {
    title: "A place for the things we keep",
    request:
      "Paper and cans keep ending up together. Could you inspect the sorting area before we tidy the yard?",
    evidence:
      "The home has no recycling upgrade. Check the sorting area in the utility room.",
    feedback:
      "The sorting place is ready. The useful things do not have to disappear into the same pile anymore.",
    repairLabel: "Set up recycling",
    location: "utility room",
  },
};

// Character details belong to this authored game story, not a live AI service.
const HOME_ROUTINES: Readonly<Record<string, string>> = {
  Ayo: "I like to sit by the flowers before the street gets busy. That little pause is how I start the day.",
  Mina: "I keep a few vegetables for the kitchen. There is always something small to check before supper.",
  Tomi: "I bring fruit back to the house and share what is left. The peelings and packaging soon add up.",
  Zara: "I keep a bookmark in three different books. Even a few quiet pages after sunset are worth coming home for.",
  Kojo: "I rinse my cup as soon as I get in. It is a tiny routine, but a sputtering tap interrupts it every time.",
  Amara:
    "I have been saving a sunny corner for herbs. I would like to step outside and pick a few for dinner.",
  Noah: "I flatten every paper box before putting it away. I just need somewhere separate to leave it.",
  Lina: "I mend little things at the table in the evening. It is much easier when I can see the stitches.",
  Musa: "I check the plants before I make tea. They get the first water of the morning, when there is enough.",
  Ada: "I stop to look at flowers on my walk. I would like our own yard to give someone a reason to stop too.",
  Theo: "I keep jars because there is usually another use for them. It is the loose cans that need a proper place.",
  Sade: "I leave my sketchbook near the window. At night, the table is where I want to finish a drawing.",
  Ife: "After a walk I water the pots by the door. Lately I have been carrying more water than I expected.",
  Maya: "I would like to grow something I can share. A small patch is enough to begin with.",
  Eli: "I sort yesterday's paper with my morning cup. Without a bin, the neat pile never stays neat for long.",
  Nia: "I like to plan tomorrow at the kitchen table. A dark home makes the evening feel shorter than it should.",
  Tayo: "I wash up before heading out. Reliable water is one of those things you notice most when it is missing.",
  Ola: "I have a favourite place to sit outside. A little green around it would make the yard feel cared for.",
  Sam: "I save clean cardboard for useful jobs. It needs to stay away from the rest of the rubbish.",
  Ari: "I put music on while I read at home. I would rather not stop reading just because the sun has gone.",
  Kemi: "I cook at home when I can. Filling a pot should not be the difficult part of making dinner.",
  Ben: "I look for small birds along the street. A living yard would give me something to watch from home.",
  Lola: "I bring reusable bags to the shops. Back at home, I want the leftover packaging to have a place too.",
  Ravi: "I like to write a few lines before bed. A working light over the table would make a real difference.",
  Amina:
    "The plants near the door get checked every day. They have been waiting for a dependable drink.",
  Jude: "I have been imagining a garden here for a while. I would rather start small than leave the ground bare.",
  Mira: "In an apartment building, shared corners are everyone's everyday space. A clear sorting place would help.",
  Dayo: "I pass neighbours on the way home after dark. Reliable power makes our shared building easier to come back to.",
};

const CORE_HOMES = [
  {
    id: "sunny",
    homeName: "Sunny House",
    ownerName: "Ayo",
    needs: ["water", "recycle", "light", "garden"],
  },
  {
    id: "bluebell",
    homeName: "Bluebell House",
    ownerName: "Mina",
    needs: ["light", "garden", "water", "recycle"],
  },
  {
    id: "mango",
    homeName: "Mango House",
    ownerName: "Tomi",
    needs: ["recycle", "water", "garden", "light"],
  },
] as const;

export const RESIDENT_CASES: readonly ResidentCase[] = [
  ...CORE_HOMES.flatMap((home) =>
    home.needs.map((need) =>
      makeCase(home.id, home.homeName, home.ownerName, need),
    ),
  ),
  ...NEIGHBORHOOD_HOME_PROFILES.map((home) =>
    makeCase(home.id, home.homeName, home.ownerName, home.need),
  ),
];

export const CASE_HOME_IDS = [
  ...new Set(RESIDENT_CASES.map((item) => item.homeId)),
];
const CASE_KEYS = new Set(RESIDENT_CASES.map((item) => item.key));
const EMPTY_ENTRY: CaseEntry = {
  met: false,
  inspected: false,
  followedUp: false,
};

function makeCase(
  homeId: string,
  homeName: string,
  ownerName: string,
  need: NeighborhoodNeed,
): ResidentCase {
  const details = NEED_DETAILS[need];
  const apartment = homeId.startsWith("district-apartments-");
  return {
    key: `${homeId}:${need}`,
    homeId,
    homeName,
    ownerName,
    need,
    ...details,
    evidence: apartment
      ? `The building has no ${need === "light" ? "solar-power" : "recycling"} upgrade. Check the maintenance point on the ground floor.`
      : details.evidence,
    location: apartment ? "ground-floor maintenance point" : details.location,
    routine:
      HOME_ROUTINES[ownerName] ??
      "I like to take a short walk and then come home to a place that works.",
  };
}

export function emptyCasework(): CaseworkProgress {
  return { schemaVersion: 1, entries: {} };
}

export function caseEntry(progress: CaseworkProgress, key: string): CaseEntry {
  return progress.entries[key] ?? EMPTY_ENTRY;
}

export function residentCaseByKey(key: string): ResidentCase | undefined {
  return RESIDENT_CASES.find((item) => item.key === key);
}

export function caseStage(
  item: ResidentCase,
  progress: CaseworkProgress,
  installed: readonly string[],
): CaseStage {
  const entry = caseEntry(progress, item.key);
  if (!entry.met) return "meet";
  if (!entry.inspected) return "inspect";
  if (!installed.includes(item.need)) return "repair";
  return entry.followedUp ? "complete" : "follow-up";
}

/** Keep an inspected repair in focus after installing it, until the check-in. */
export function currentCaseForHome(
  homeId: string,
  progress: CaseworkProgress,
  installed: readonly string[],
): ResidentCase | undefined {
  const cases = RESIDENT_CASES.filter((item) => item.homeId === homeId);
  return (
    cases.find((item) => {
      const entry = caseEntry(progress, item.key);
      return (entry.met || entry.inspected) && !entry.followedUp;
    }) ??
    cases.find((item) => !installed.includes(item.need)) ??
    cases.find((item) => caseEntry(progress, item.key).met) ??
    cases[0]
  );
}

export function recordCaseEvent(
  progress: CaseworkProgress,
  key: string,
  event: CaseEvent,
  installed: readonly string[],
): CaseworkProgress {
  const item = residentCaseByKey(key);
  if (!item) return progress;
  const entry = caseEntry(progress, key);
  if (
    event === "followed-up" &&
    (!entry.met || !entry.inspected || !installed.includes(item.need))
  )
    return progress;
  const field = event === "followed-up" ? "followedUp" : event;
  if (entry[field]) return progress;
  return {
    schemaVersion: 1,
    entries: { ...progress.entries, [key]: { ...entry, [field]: true } },
  };
}

/** A changed challenge or repaired-save rollback must earn a fresh check-in. */
export function reconcileCasework(
  progress: CaseworkProgress,
  upgradesByHome: Readonly<Record<string, readonly string[]>>,
): CaseworkProgress {
  let next = progress;
  for (const item of RESIDENT_CASES) {
    const entry = caseEntry(progress, item.key);
    if (
      entry.followedUp &&
      !(upgradesByHome[item.homeId] ?? []).includes(item.need)
    ) {
      next = {
        schemaVersion: 1,
        entries: {
          ...next.entries,
          [item.key]: { ...entry, inspected: false, followedUp: false },
        },
      };
    }
  }
  return next;
}

/** Reject unknown versions and malformed entries as a whole; never modify them. */
export function parseCasework(raw: string | null): CaseworkProgress | null {
  if (raw === null) return emptyCasework();
  if (raw.length > 64_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isRecord(value.entries)
    )
      return null;
    if (
      Object.keys(value).some(
        (key) => key !== "schemaVersion" && key !== "entries",
      )
    )
      return null;
    const entries: Record<string, CaseEntry> = {};
    for (const [key, entry] of Object.entries(value.entries)) {
      if (!CASE_KEYS.has(key) || !isRecord(entry)) return null;
      if (
        Object.keys(entry).length !== 3 ||
        typeof entry.met !== "boolean" ||
        typeof entry.inspected !== "boolean" ||
        typeof entry.followedUp !== "boolean"
      )
        return null;
      if (entry.followedUp && (!entry.met || !entry.inspected)) return null;
      entries[key] = {
        met: entry.met,
        inspected: entry.inspected,
        followedUp: entry.followedUp,
      };
    }
    return { schemaVersion: 1, entries };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  challengeById,
  CHALLENGE_PROGRESS_STORAGE_KEY,
  challengeStars,
  completedGoalIds,
  copyChallengeSetup,
  isChallengeComplete,
  isChallengeUnlocked,
  nextChallengeId,
  TERRA_CHALLENGES,
} from "../../lib/challenges/catalog";
import { nextChallengeAction } from "../../lib/challenges/next-action";
import {
  CASEWORK_STORAGE_KEY,
  CASE_HOME_IDS,
  caseStage,
  currentCaseForHome,
  emptyCasework,
  parseCasework,
  reconcileCasework,
  recordCaseEvent,
  residentCaseByKey,
  type ResidentCase,
} from "../../lib/immersive-town/neighborhood-casework";
import {
  neighborhoodHomeProfile,
  NEIGHBORHOOD_HOME_PROFILES,
  startingNeighborhoodUpgrades,
} from "../../lib/immersive-town/neighborhood-home-stories";
import ChallengeTrail from "./ChallengeTrail";
import ResidentCaseJournal from "./ResidentCaseJournal";
import { GameIcon } from "./GameIcon";
import {
  CORE_HOUSE_UPGRADE_IDS,
  getHouseHealth,
  HOUSE_UPGRADE_IDS,
  type CoreHouseUpgradeId,
  type HouseId,
  type HouseUpgradeId,
} from "./HouseDiagnostics";
import ImmersiveTownMap, {
  type NeighborhoodHouseSelection,
} from "./ImmersiveTownMap";

type UpgradeId = HouseUpgradeId;
type CompoundId = HouseId;

type DragPiece = Readonly<{
  id: UpgradeId;
  x: number;
  y: number;
}>;

type CompoundWorldProps = Readonly<{
  leoReply?: Readonly<{ id: string; text: string }> | undefined;
  timeOfDay?: "day" | "night";
  backgroundInert?: boolean;
  onRiverMessage: (message: string) => void;
}>;

const UPGRADES: readonly {
  id: UpgradeId;
  group: "energy" | "water" | "nature" | "care" | "travel";
  label: string;
  hint: string;
  icon: Parameters<typeof GameIcon>[0]["name"];
}[] = [
  {
    id: "light",
    group: "energy",
    label: "Solar power",
    hint: "Supply clean electricity",
    icon: "energy",
  },
  {
    id: "water",
    group: "water",
    label: "Clean water",
    hint: "Restore the water supply",
    icon: "water",
  },
  {
    id: "garden",
    group: "nature",
    label: "Garden",
    hint: "Restore green space",
    icon: "nature",
  },
  {
    id: "recycle",
    group: "care",
    label: "Recycling",
    hint: "Sort household waste",
    icon: "recycle",
  },
  {
    id: "rain-tank",
    group: "water",
    label: "Rainwater tank",
    hint: "Store water for dry spells",
    icon: "rain",
  },
  {
    id: "compost",
    group: "nature",
    label: "Composter",
    hint: "Recover organic waste",
    icon: "compost",
  },
  {
    id: "shade-tree",
    group: "nature",
    label: "Shade tree",
    hint: "Cools the yard naturally",
    icon: "tree",
  },
  {
    id: "bike-rack",
    group: "travel",
    label: "Bike rack",
    hint: "Support low-carbon travel",
    icon: "bike",
  },
  {
    id: "insulation",
    group: "energy",
    label: "Insulation",
    hint: "Reduce heating demand",
    icon: "warm",
  },
  {
    id: "bird-home",
    group: "nature",
    label: "Bird habitat",
    hint: "Support urban wildlife",
    icon: "bird",
  },
  {
    id: "first-aid",
    group: "care",
    label: "Safety kit",
    hint: "Prepare for emergencies",
    icon: "first-aid",
  },
  {
    id: "repair-kit",
    group: "care",
    label: "Repair kit",
    hint: "Maintain home equipment",
    icon: "tools",
  },
] as const;

const UPGRADE_GROUPS = [
  { id: "energy", label: "Energy" },
  { id: "water", label: "Water systems" },
  { id: "nature", label: "Environment" },
  { id: "care", label: "Maintenance" },
  { id: "travel", label: "Transport" },
] as const;

const COMPOUNDS: readonly {
  id: CompoundId;
  name: string;
  family: string;
  garden: string;
}[] = [
  { id: "sunny", name: "Sunny House", family: "Ayo's home", garden: "Flowers" },
  {
    id: "bluebell",
    name: "Bluebell House",
    family: "Mina's home",
    garden: "Veggies",
  },
  { id: "mango", name: "Mango House", family: "Tomi's home", garden: "Fruit" },
] as const;

const LEO_OBSERVATIONS: Readonly<Record<UpgradeId, string>> = {
  light:
    "Look—the windows and yard began to glow after that change. What do you think reached the home?",
  water:
    "The thirsty garden perked up when clean water arrived. What changed first?",
  garden:
    "New flowers and leaves appeared in the yard. Which neighbours might notice them next?",
  recycle:
    "The loose cans and paper now have a sorting place. What looks different around the yard?",
  "rain-tank":
    "Rainwater is collecting beside the home instead of running away. When might the garden need it?",
  compost:
    "Fruit peels and dry leaves are gathering in one box. What might happen to them over time?",
  "shade-tree":
    "A new patch of shade reaches the yard. What else might change near this home later?",
  "bike-rack":
    "More bikes have a safe place to stop. How might that change short trips around Rivergate?",
  insulation:
    "The home looks almost the same outside, but the rooms hold their temperature longer. Why might that be?",
  "bird-home":
    "A bird is circling the new little shelter. What made this yard useful to wildlife?",
  "first-aid":
    "The safety kit now has a clear, easy-to-find place. When could that small choice matter?",
  "repair-kit":
    "The fix-it kit is ready before anything breaks. What small problem could the family handle early?",
};

const OWNER_HELP: Readonly<Record<CoreHouseUpgradeId, string>> = {
  light: "Our lights are out!",
  water: "Our garden is thirsty!",
  garden: "Can we grow a garden?",
  recycle: "Can we tidy our yard?",
};

const FIRST_CHALLENGE = TERRA_CHALLENGES[0];

function initialCompoundState(): Record<CompoundId, readonly UpgradeId[]> {
  if (FIRST_CHALLENGE === undefined)
    return { sunny: [], bluebell: [], mango: [] };
  return copyChallengeSetup(FIRST_CHALLENGE);
}

function initialNeighborhoodState(): Record<string, readonly UpgradeId[]> {
  return Object.fromEntries(
    NEIGHBORHOOD_HOME_PROFILES.map((home) => [
      home.id,
      startingNeighborhoodUpgrades(home.need),
    ]),
  );
}

export default function CompoundWorld({
  leoReply,
  timeOfDay = "night",
  backgroundInert = false,
  onRiverMessage,
}: CompoundWorldProps) {
  const [chapterActive, setChapterActive] = useState(false);
  const [armedUpgrade, setArmedUpgrade] = useState<UpgradeId | null>(null);
  const [compounds, setCompounds] = useState(initialCompoundState);
  const [activeChallengeId, setActiveChallengeId] = useState(
    FIRST_CHALLENGE?.id ?? "sunny-after-dark",
  );
  const [challengeTrailOpen, setChallengeTrailOpen] = useState(false);
  const [challengeMoves, setChallengeMoves] = useState(0);
  const [challengeHintsUsed, setChallengeHintsUsed] = useState(0);
  const [completedChallengeIds, setCompletedChallengeIds] = useState<
    readonly string[]
  >([]);
  const [bestChallengeStars, setBestChallengeStars] = useState<
    Readonly<Record<string, number>>
  >({});
  const [attemptComplete, setAttemptComplete] = useState(false);
  const [challengeProgressReady, setChallengeProgressReady] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<{
    readonly challengeId: string;
    readonly stars: 1 | 2 | 3;
  } | null>(null);
  const [selectedCompound, setSelectedCompound] = useState<CompoundId | null>(
    null,
  );
  const [selectedNeighborhoodHouse, setSelectedNeighborhoodHouse] =
    useState<NeighborhoodHouseSelection | null>(null);
  const [neighborhoodHomes, setNeighborhoodHomes] = useState(
    initialNeighborhoodState,
  );
  const [casework, setCasework] = useState(emptyCasework);
  const [caseworkReady, setCaseworkReady] = useState(false);
  const [residentJournalOpen, setResidentJournalOpen] = useState(false);
  const [selectedResidentCaseKey, setSelectedResidentCaseKey] = useState<
    string | null
  >(null);
  const [caseworkStorageNotice, setCaseworkStorageNotice] = useState<
    string | null
  >(null);
  const caseworkWritableRef = useRef(false);
  const allHomeUpgrades = useMemo<
    Readonly<Record<string, readonly UpgradeId[]>>
  >(
    () => ({ ...neighborhoodHomes, ...compounds }),
    [compounds, neighborhoodHomes],
  );
  const [dragPiece, setDragPiece] = useState<DragPiece | null>(null);
  const [hoveredCompound, setHoveredCompound] = useState<CompoundId | null>(
    null,
  );
  const [townAwake, setTownAwake] = useState(false);
  const dragPieceRef = useRef<DragPiece | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const suppressNextUpgradeClickRef = useRef(false);
  const addUpgradeRef = useRef<
    (compoundId: CompoundId, upgradeId: UpgradeId) => void
  >(() => undefined);
  const worldScrollRef = useRef<HTMLDivElement>(null);
  const challengeTrailButtonRef = useRef<HTMLButtonElement>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const activeChallenge =
    challengeById(activeChallengeId) ??
    FIRST_CHALLENGE ??
    missingChallengeCatalogue();

  const activeCompletedGoalIds = useMemo(
    () => completedGoalIds(activeChallenge, compounds),
    [activeChallenge, compounds],
  );
  const nextAction = useMemo(
    () => nextChallengeAction(activeChallenge, compounds),
    [activeChallenge, compounds],
  );
  const activePieceId = dragPiece?.id ?? armedUpgrade;
  const guidedPieceReady =
    nextAction !== null && activePieceId === nextAction.upgradeId;
  const nextActionHouse =
    nextAction === null
      ? null
      : (COMPOUNDS.find((compound) => compound.id === nextAction.houseId) ??
        null);
  const nextActionUpgrade =
    nextAction === null
      ? null
      : (UPGRADES.find((upgrade) => upgrade.id === nextAction.upgradeId) ??
        null);
  const nextChallenge =
    nextChallengeId(activeChallenge.id) === null
      ? null
      : challengeById(nextChallengeId(activeChallenge.id) ?? "");
  const nextNeighborhoodCall = NEIGHBORHOOD_HOME_PROFILES.find((home) => {
    const upgrades = neighborhoodHomes[home.id] ?? [];
    return !upgrades.includes(home.need);
  });

  const litHomes = useMemo(
    () =>
      Object.values(compounds).filter((upgrades) => upgrades.includes("light"))
        .length,
    [compounds],
  );
  const completedActions = useMemo(
    () =>
      Object.values(compounds).reduce((sum, items) => sum + items.length, 0),
    [compounds],
  );
  useEffect(() => {
    function clearDrag() {
      dragPieceRef.current = null;
      dragPointerIdRef.current = null;
      dragOriginRef.current = null;
      dragMovedRef.current = false;
      setDragPiece(null);
      setHoveredCompound(null);
    }

    function move(event: PointerEvent) {
      const active = dragPieceRef.current;
      if (active === null || dragPointerIdRef.current !== event.pointerId)
        return;
      const origin = dragOriginRef.current;
      if (
        origin !== null &&
        Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 6
      ) {
        dragMovedRef.current = true;
      }
      const next = { ...active, x: event.clientX, y: event.clientY };
      dragPieceRef.current = next;
      setDragPiece(next);
      setHoveredCompound(compoundAt(event.clientX, event.clientY));
    }

    function release(event: PointerEvent) {
      const active = dragPieceRef.current;
      if (active === null || dragPointerIdRef.current !== event.pointerId)
        return;
      const target = compoundAt(event.clientX, event.clientY);
      suppressNextUpgradeClickRef.current = dragMovedRef.current;
      clearDrag();
      if (target !== null) addUpgradeRef.current(target, active.id);
    }

    function cancel() {
      suppressNextUpgradeClickRef.current = false;
      clearDrag();
    }

    function cancelWhenHidden() {
      if (document.visibilityState === "hidden") cancel();
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
    };
  }, []);

  useEffect(
    () => () => {
      if (celebrationTimerRef.current !== null)
        window.clearTimeout(celebrationTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const map = worldScrollRef.current;
    if (map === null) return;
    map.scrollLeft = 315;
    map.scrollTop = 28;
  }, []);

  useEffect(() => {
    const restored = restoreChallengeProgress();
    if (restored !== null) {
      const restoredChallenge =
        challengeById(restored.activeChallengeId) ??
        FIRST_CHALLENGE ??
        missingChallengeCatalogue();
      setActiveChallengeId(restoredChallenge.id);
      setCompounds(restored.town);
      setChallengeMoves(restored.moves);
      setChallengeHintsUsed(restored.hintsUsed);
      setCompletedChallengeIds(restored.completedIds);
      setBestChallengeStars(restored.bestStars);
      setNeighborhoodHomes(restored.neighborhoodHomes);
      const restoredComplete = isChallengeComplete(
        restoredChallenge,
        restored.town,
      );
      setAttemptComplete(restoredComplete);
      if (restoredComplete) {
        const restoredStars = restored.bestStars[restoredChallenge.id];
        const stars: 1 | 2 | 3 =
          restoredStars === 3 ? 3 : restoredStars === 2 ? 2 : 1;
        setCompletionNotice({ challengeId: restoredChallenge.id, stars });
      }
    }
    setChallengeProgressReady(true);
  }, []);

  useEffect(() => {
    try {
      const restored = parseCasework(
        window.localStorage.getItem(CASEWORK_STORAGE_KEY),
      );
      if (restored === null) {
        // Keep unrecognised/corrupt data intact; this session can still be played.
        setCaseworkStorageNotice(
          "Older or unreadable journal data was left untouched. New notes will last for this session only.",
        );
      } else {
        setCasework(restored);
        caseworkWritableRef.current = true;
      }
    } catch {
      setCaseworkStorageNotice(
        "Device storage is unavailable. Your journal will last for this session only.",
      );
    }
    setCaseworkReady(true);
  }, []);

  useEffect(() => {
    if (!caseworkReady || !challengeProgressReady) return;
    setCasework((current) => reconcileCasework(current, allHomeUpgrades));
  }, [allHomeUpgrades, caseworkReady, challengeProgressReady]);

  useEffect(() => {
    if (!caseworkReady || !caseworkWritableRef.current) return;
    try {
      window.localStorage.setItem(
        CASEWORK_STORAGE_KEY,
        JSON.stringify(casework),
      );
    } catch {
      caseworkWritableRef.current = false;
      setCaseworkStorageNotice(
        "This device could not save the journal. New notes will last for this session only.",
      );
    }
  }, [casework, caseworkReady]);

  useEffect(() => {
    if (backgroundInert || challengeTrailOpen) setResidentJournalOpen(false);
  }, [backgroundInert, challengeTrailOpen]);

  useEffect(() => {
    if (!challengeProgressReady) return;
    try {
      window.localStorage.setItem(
        CHALLENGE_PROGRESS_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          activeChallengeId,
          town: compounds,
          moves: challengeMoves,
          hintsUsed: challengeHintsUsed,
          completedIds: completedChallengeIds,
          bestStars: bestChallengeStars,
          neighborhoodHomes,
        }),
      );
    } catch {
      // Play continues in memory when private browsing blocks local storage.
    }
  }, [
    activeChallengeId,
    bestChallengeStars,
    challengeHintsUsed,
    challengeMoves,
    challengeProgressReady,
    completedChallengeIds,
    compounds,
    neighborhoodHomes,
  ]);

  function addUpgrade(compoundId: CompoundId, upgradeId: UpgradeId) {
    dragPieceRef.current = null;
    dragPointerIdRef.current = null;
    dragOriginRef.current = null;
    dragMovedRef.current = false;
    setDragPiece(null);
    setHoveredCompound(null);
    setArmedUpgrade(null);
    if (!compounds[compoundId].includes(upgradeId)) {
      const nextTown = {
        ...compounds,
        [compoundId]: [...compounds[compoundId], upgradeId],
      };
      const nextMoves = challengeMoves + 1;
      setCompounds(nextTown);
      setChallengeMoves(nextMoves);
      const home = COMPOUNDS.find((compound) => compound.id === compoundId);
      onRiverMessage(
        `${home?.family ?? "This home"} added ${upgradeLabel(upgradeId).toLowerCase()}. ${LEO_OBSERVATIONS[upgradeId]}`,
      );
      if (!attemptComplete && isChallengeComplete(activeChallenge, nextTown)) {
        const stars = challengeStars({
          challenge: activeChallenge,
          moves: nextMoves,
          hintsUsed: challengeHintsUsed,
        });
        setAttemptComplete(true);
        setCompletionNotice({ challengeId: activeChallenge.id, stars });
        setCompletedChallengeIds((current) =>
          current.includes(activeChallenge.id)
            ? current
            : [...current, activeChallenge.id],
        );
        setBestChallengeStars((current) => ({
          ...current,
          [activeChallenge.id]: Math.max(
            current[activeChallenge.id] ?? 0,
            stars,
          ),
        }));
        setTownAwake(true);
        if (celebrationTimerRef.current !== null)
          window.clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = window.setTimeout(
          () => setTownAwake(false),
          2200,
        );
        onRiverMessage(
          `Your experiment worked! Here’s what we discovered: ${activeChallenge.learning} You earned ${stars} ${stars === 1 ? "leaf" : "leaves"}.`,
        );
      }
    } else {
      onRiverMessage(
        `${upgradeLabel(upgradeId)} is already helping this home. What might look different if you try it somewhere else?`,
      );
    }
  }

  function addNeighborhoodUpgrade(
    house: NeighborhoodHouseSelection,
    upgradeId: UpgradeId,
  ) {
    dragPieceRef.current = null;
    dragPointerIdRef.current = null;
    dragOriginRef.current = null;
    dragMovedRef.current = false;
    setDragPiece(null);
    setHoveredCompound(null);
    setArmedUpgrade(null);

    const story = neighborhoodHomeProfile(house.id, house.displayName);
    const installed =
      neighborhoodHomes[house.id] ?? startingNeighborhoodUpgrades(story.need);
    if (installed.includes(story.need)) {
      onRiverMessage(
        `${story.ownerName}'s home is healthy now. Another neighbour is still waiting—tap any other house to visit them.`,
      );
      return;
    }
    if (upgradeId !== story.need) {
      onRiverMessage(
        `${upgradeLabel(upgradeId)} can help another problem, but ${story.ownerName} needs ${upgradeLabel(story.need).toLowerCase()} here. Try that helper next.`,
      );
      setSelectedNeighborhoodHouse(house);
      return;
    }

    setNeighborhoodHomes((current) => ({
      ...current,
      [house.id]: [...(current[house.id] ?? installed), upgradeId],
    }));
    setTownAwake(true);
    if (celebrationTimerRef.current !== null)
      window.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = window.setTimeout(
      () => setTownAwake(false),
      2200,
    );
    onRiverMessage(
      `${story.ownerName}'s home is working again! ${story.healthy} Talk to ${story.ownerName} at home for a check-in; your resident journal keeps the story.`,
    );
  }

  function residentCaseForHome(homeId: string) {
    const selected =
      selectedResidentCaseKey === null
        ? undefined
        : residentCaseByKey(selectedResidentCaseKey);
    return selected?.homeId === homeId
      ? selected
      : currentCaseForHome(homeId, casework, allHomeUpgrades[homeId] ?? []);
  }

  function inspectResidentHome(homeId: string) {
    const item = residentCaseForHome(homeId);
    if (!item) return;
    setCasework((current) =>
      recordCaseEvent(
        current,
        item.key,
        "inspected",
        allHomeUpgrades[homeId] ?? [],
      ),
    );
  }

  function talkToResident(homeId: string) {
    const item = residentCaseForHome(homeId);
    if (!item) return;
    const installed = allHomeUpgrades[homeId] ?? [];
    setCasework((current) => {
      const met = recordCaseEvent(current, item.key, "met", installed);
      return recordCaseEvent(met, item.key, "followed-up", installed);
    });
    setSelectedResidentCaseKey(item.key);
    setResidentJournalOpen(true);
  }

  function openResidentJournal() {
    if (selectedResidentCaseKey === null) {
      const available = CASE_HOME_IDS.map((id) =>
        currentCaseForHome(id, casework, allHomeUpgrades[id] ?? []),
      );
      const next =
        available.find(
          (item) =>
            item !== undefined &&
            caseStage(item, casework, allHomeUpgrades[item.homeId] ?? []) !==
              "complete",
        ) ?? available[0];
      if (next) setSelectedResidentCaseKey(next.key);
    }
    setResidentJournalOpen(true);
  }

  function visitResidentCase(item: ResidentCase) {
    setResidentJournalOpen(false);
    setSelectedResidentCaseKey(item.key);
    setArmedUpgrade(null);
    if (
      item.homeId === "sunny" ||
      item.homeId === "bluebell" ||
      item.homeId === "mango"
    ) {
      setSelectedNeighborhoodHouse(null);
      setSelectedCompound(item.homeId);
    } else {
      setSelectedCompound(null);
      setSelectedNeighborhoodHouse({
        id: item.homeId,
        displayName: `${item.ownerName}'s ${item.homeName}`,
      });
    }
  }

  addUpgradeRef.current = addUpgrade;

  function startChallenge(challengeId: string) {
    const challenge = challengeById(challengeId);
    if (
      challenge === null ||
      !isChallengeUnlocked(challenge.id, completedChallengeIds)
    )
      return;
    setActiveChallengeId(challenge.id);
    setCompounds((current) =>
      preserveTownHelpers(copyChallengeSetup(challenge), current),
    );
    setChallengeMoves(0);
    setChallengeHintsUsed(0);
    setAttemptComplete(false);
    setCompletionNotice(null);
    setSelectedCompound(null);
    setSelectedNeighborhoodHouse(null);
    setChallengeTrailOpen(false);
    onRiverMessage(
      `Take a look before changing anything. ${challenge.story} What do you notice? ${challenge.instruction}`,
    );
    const map = worldScrollRef.current;
    if (map !== null) {
      map.scrollLeft = 315;
      map.scrollTop = 28;
    }
  }

  function startNextChallenge() {
    const nextId = nextChallengeId(activeChallenge.id);
    if (nextId === null) {
      setCompletionNotice(null);
      setChallengeTrailOpen(true);
      return;
    }
    startChallenge(nextId);
  }

  function startDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    upgradeId: UpgradeId,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setArmedUpgrade(null);
    suppressNextUpgradeClickRef.current = false;
    dragPointerIdRef.current = event.pointerId;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    dragMovedRef.current = false;
    const next = { id: upgradeId, x: event.clientX, y: event.clientY };
    dragPieceRef.current = next;
    setDragPiece(next);
  }

  function runTown() {
    setTownAwake(true);
    if (celebrationTimerRef.current !== null)
      window.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = window.setTimeout(
      () => setTownAwake(false),
      2200,
    );
    if (litHomes === COMPOUNDS.length) {
      onRiverMessage(
        "All three homes shine when evening arrives. What changed across the whole street?",
      );
    } else if (completedActions === 0) {
      onRiverMessage(
        "Rivergate is already busy, but these homes are waiting for your first experiment. Which dark window do you notice?",
      );
    } else {
      onRiverMessage(
        `${litHomes} of ${COMPOUNDS.length} homes can shine tonight. What is different about the homes that are still dark?`,
      );
    }
  }

  return (
    <>
      <aside
        hidden={chapterActive}
        aria-hidden={backgroundInert || undefined}
        className="toy-box"
        inert={backgroundInert || undefined}
        aria-labelledby="toy-box-heading"
      >
        <div className="toy-box-heading">
          <span aria-hidden="true">
            <GameIcon name="tools" size={25} />
          </span>
          <div>
            <h1 id="toy-box-heading">City tools</h1>
            <p>12 ways to improve Rivergate</p>
          </div>
        </div>
        <div className="toy-shelf">
          {UPGRADE_GROUPS.map((group) => (
            <section className="toy-shelf-group" key={group.id}>
              <h2>{group.label}</h2>
              <div className="toy-shelf-items">
                {UPGRADES.filter((upgrade) => upgrade.group === group.id).map(
                  (upgrade) => (
                    <button
                      aria-label={`${upgrade.label}. ${upgrade.hint}. Drag to a home.`}
                      aria-pressed={armedUpgrade === upgrade.id}
                      className={`toy-piece toy-${upgrade.id}${
                        nextAction?.upgradeId === upgrade.id &&
                        !guidedPieceReady
                          ? " is-guided-target"
                          : ""
                      }`}
                      key={upgrade.id}
                      onClick={() => {
                        if (suppressNextUpgradeClickRef.current) {
                          suppressNextUpgradeClickRef.current = false;
                          return;
                        }
                        setArmedUpgrade((current) =>
                          current === upgrade.id ? null : upgrade.id,
                        );
                      }}
                      onPointerDown={(event) => startDrag(event, upgrade.id)}
                      type="button"
                    >
                      <span className="toy-piece-icon">
                        <GameIcon name={upgrade.icon} size={34} />
                      </span>
                      <span>
                        <strong>{upgrade.label}</strong>
                        <small>{upgrade.hint}</small>
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
        <p className="toy-box-tip">
          Drag an upgrade to a home, or select it and then select a home. Select
          a home alone to inspect it.
        </p>
      </aside>

      <section
        aria-hidden={backgroundInert || undefined}
        className={`neighborhood-panel${townAwake ? " town-awake" : ""}${challengeTrailOpen ? " challenge-trail-open" : ""}${chapterActive ? " chapter-active" : ""}`}
        inert={backgroundInert || undefined}
        aria-labelledby={chapterActive ? undefined : "neighborhood-heading"}
        aria-label={chapterActive ? "East Bridge opening chapter" : undefined}
      >
        <header
          aria-hidden={challengeTrailOpen || undefined}
          className="neighborhood-quest challenge-quest"
          inert={challengeTrailOpen || undefined}
        >
          <div>
            <span className="quest-kicker">
              Stage {activeChallenge.stage} · {activeChallenge.difficulty}
            </span>
            <h2 id="neighborhood-heading">{activeChallenge.title}</h2>
            <p className="challenge-quest-instruction">
              {activeChallenge.instruction}
            </p>
          </div>
          <div className="challenge-quest-actions">
            <span className="challenge-goal-count">
              <strong>{activeCompletedGoalIds.length}</strong>
              <small>of {activeChallenge.goals.length} goals</small>
            </span>
            <button
              onClick={() => {
                setSelectedCompound(null);
                setChallengeTrailOpen(true);
              }}
              ref={challengeTrailButtonRef}
              type="button"
            >
              <GameIcon name="spark" size={19} />
              Objectives
            </button>
          </div>
          <div
            aria-live="polite"
            className={`quest-next-move${
              nextAction === null
                ? " is-ready-to-watch"
                : guidedPieceReady
                  ? " is-ready-for-home"
                  : ""
            }`}
            role="status"
          >
            <span className="quest-next-number" aria-hidden="true">
              {nextAction === null ? "3" : guidedPieceReady ? "2" : "1"}
            </span>
            <span className="quest-next-copy">
              <small>Next action</small>
              <strong>
                {nextAction === null
                  ? "Review the outcome"
                  : guidedPieceReady
                    ? `Tap ${nextActionHouse?.name ?? "the highlighted house"}`
                    : `Choose ${nextActionUpgrade?.label ?? "the highlighted helper"}`}
              </strong>
              <span>
                {nextAction === null
                  ? "Select Review changes to see the outcome."
                  : guidedPieceReady
                    ? `${nextActionUpgrade?.label ?? "The helper"} is ready to add.`
                    : `Then tap ${nextActionHouse?.name ?? "the highlighted house"}.`}
              </span>
            </span>
          </div>
        </header>

        <div
          aria-hidden={challengeTrailOpen || undefined}
          className="neighborhood-world"
          inert={challengeTrailOpen || undefined}
        >
          <div
            aria-label="Interactive 3D Terra World neighborhood"
            className="world-scroll-region"
            ref={worldScrollRef}
            role="region"
            tabIndex={0}
          >
            <div className="world-canvas is-immersive-3d">
              <ImmersiveTownMap
                onChapterActiveChange={setChapterActive}
                repairMapMission={
                  nextAction && nextActionHouse
                    ? {
                        houseId: nextAction.houseId,
                        label: nextActionHouse.name,
                        instruction: `Add ${nextActionUpgrade?.label.toLowerCase() ?? "the missing upgrade"} at ${nextActionHouse.name}.`,
                      }
                    : null
                }
                missionMapStatus={
                  nextAction === null
                    ? "Review changes, then choose the next objective."
                    : activeChallenge.instruction
                }
                leoReply={leoReply}
                timeOfDay={timeOfDay}
                onResidentTalk={talkToResident}
                onHomeInspected={inspectResidentHome}
                residentJournalOpen={
                  residentJournalOpen && !backgroundInert && !challengeTrailOpen
                }
                activeUpgradeId={dragPiece?.id ?? armedUpgrade}
                houses={compounds}
                neighborhoodHouses={neighborhoodHomes}
                onSelectionConsumed={() => {
                  setSelectedCompound(null);
                  setSelectedNeighborhoodHouse(null);
                }}
                onWalkStart={() => {
                  dragPieceRef.current = null;
                  dragPointerIdRef.current = null;
                  dragOriginRef.current = null;
                  dragMovedRef.current = false;
                  setDragPiece(null);
                  setHoveredCompound(null);
                  setArmedUpgrade(null);
                }}
                onHouseDrop={addUpgrade}
                onHouseSelect={(houseId) => {
                  setSelectedNeighborhoodHouse(null);
                  setSelectedCompound(houseId);
                }}
                onNeighborhoodHouseDrop={addNeighborhoodUpgrade}
                onNeighborhoodHouseSelect={(house) => {
                  setSelectedCompound(null);
                  setSelectedNeighborhoodHouse(house);
                }}
                selectedHouseId={selectedCompound}
                selectedNeighborhoodHouseId={
                  selectedNeighborhoodHouse?.id ?? null
                }
              />
              <div className="compound-grid">
                {COMPOUNDS.map((compound) => {
                  const upgrades = compounds[compound.id];
                  const health = getHouseHealth(compound.id, upgrades);
                  const isLit = upgrades.includes("light");
                  const isWatered = upgrades.includes("water");
                  const isGardened = upgrades.includes("garden");
                  const isRecycling = upgrades.includes("recycle");
                  const ownerHelp =
                    health.recommendedUpgrade === null
                      ? null
                      : OWNER_HELP[health.recommendedUpgrade];
                  return (
                    <button
                      aria-label={`${compound.name}. ${health.healthyCount} of ${health.totalCount} parts feel good. Walk through the front door.`}
                      className={`compound compound-${compound.id}${
                        hoveredCompound === compound.id ? " is-drop-target" : ""
                      }${isLit ? " is-lit" : ""}${
                        isWatered ? " is-watered" : ""
                      }${isGardened ? " is-gardened" : ""}${
                        isRecycling ? " is-recycling" : ""
                      }${health.allHealthy ? " is-healthy" : " needs-help"}${
                        nextAction?.houseId === compound.id && guidedPieceReady
                          ? " is-guided-target"
                          : ""
                      }`}
                      data-compound-id={compound.id}
                      key={compound.id}
                      onClick={() => {
                        if (armedUpgrade !== null) {
                          addUpgrade(compound.id, armedUpgrade);
                        } else {
                          setSelectedCompound(compound.id);
                        }
                      }}
                      type="button"
                    >
                      <span className="compound-scene" aria-hidden="true">
                        <span className="yard-glow" />
                        <span className="yard-lights">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="compound-tree">
                          <i />
                        </span>
                        <span className="cartoon-house">
                          <i className="house-chimney" />
                          <i className="house-roof" />
                          <i className="solar-roof" />
                          <i className="house-wall" />
                          <i className="house-side" />
                          <i className="house-window window-left" />
                          <i className="house-window window-right" />
                          <i className="house-door" />
                          <i className="house-step" />
                        </span>
                        <span className={`garden-bed garden-${compound.id}`}>
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="garden-bloom">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="water-barrel" />
                        <span className="water-spray" />
                        <span className="recycle-bin">♻</span>
                        {ownerHelp !== null && (
                          <span className="home-owner-alert">
                            <span className="home-owner-bubble">
                              {ownerHelp}
                            </span>
                            <span className="home-owner-person">
                              <i className="owner-head" />
                              <i className="owner-body" />
                              <i className="owner-arm" />
                              <i className="owner-leg owner-leg-left" />
                              <i className="owner-leg owner-leg-right" />
                            </span>
                          </span>
                        )}
                      </span>
                      <span className="compound-name">
                        <strong>{compound.name}</strong>
                        <small>
                          {health.allHealthy
                            ? "All healthy"
                            : `${health.healthyCount}/${health.totalCount} ready`}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="map-pan-hint">Drag to look around · scroll to zoom</p>
        </div>

        <footer
          aria-hidden={challengeTrailOpen || undefined}
          className="neighborhood-actions"
          inert={challengeTrailOpen || undefined}
        >
          <p aria-live="polite">
            {completedActions === 0
              ? "Start with one small change."
              : `${completedActions} improvement${completedActions === 1 ? "" : "s"} made to the neighborhood.`}
          </p>
          <button
            className={nextAction === null ? "is-guided-target" : undefined}
            onClick={runTown}
            type="button"
          >
            <GameIcon name="play" size={22} />
            Review changes
          </button>
          <button
            className="neighbor-call-button"
            disabled={nextNeighborhoodCall === undefined}
            onClick={() => {
              if (nextNeighborhoodCall === undefined) return;
              setSelectedCompound(null);
              setSelectedNeighborhoodHouse({
                id: nextNeighborhoodCall.id,
                displayName: nextNeighborhoodCall.displayName,
              });
            }}
            type="button"
          >
            <GameIcon name="home" size={22} />
            {nextNeighborhoodCall === undefined
              ? "All neighbours happy"
              : "Visit a neighbour"}
          </button>
        </footer>

        {completionNotice !== null && !challengeTrailOpen && (
          <div className="challenge-complete-toast" aria-live="polite">
            <span className="challenge-complete-mark" aria-hidden="true">
              <GameIcon name="nature" size={27} />
            </span>
            <div>
              <strong>
                {nextChallenge === null
                  ? "Rivergate is thriving!"
                  : "A new neighbour needs you!"}
              </strong>
              <span>
                {nextChallenge === null
                  ? `${completionNotice.stars} ${completionNotice.stars === 1 ? "leaf" : "leaves"} earned`
                  : `Next: ${nextChallenge.title}`}
              </span>
            </div>
            <button onClick={startNextChallenge} type="button">
              {nextChallengeId(completionNotice.challengeId) === null
                ? "See my trail"
                : "Answer the call"}
              <GameIcon name="arrow" size={19} />
            </button>
          </div>
        )}

        <ChallengeTrail
          activeChallenge={activeChallenge}
          bestStars={bestChallengeStars}
          completedIds={completedChallengeIds}
          moves={challengeMoves}
          onClose={() => {
            setChallengeTrailOpen(false);
            window.requestAnimationFrame(() =>
              challengeTrailButtonRef.current?.focus(),
            );
          }}
          onHintUsed={() => setChallengeHintsUsed((count) => count + 1)}
          onRiverMessage={onRiverMessage}
          onStart={startChallenge}
          open={challengeTrailOpen}
          town={compounds}
        />
        {!challengeTrailOpen && !chapterActive && (
          <ResidentCaseJournal
            open={residentJournalOpen && !backgroundInert}
            timeOfDay={timeOfDay}
            progress={casework}
            upgradesByHome={allHomeUpgrades}
            selectedCaseKey={selectedResidentCaseKey}
            storageNotice={caseworkStorageNotice}
            onOpen={openResidentJournal}
            onClose={() => setResidentJournalOpen(false)}
            onSelect={setSelectedResidentCaseKey}
            onVisit={visitResidentCase}
            onReadRequest={(key) => {
              const item = residentCaseByKey(key);
              if (item)
                setCasework((current) =>
                  recordCaseEvent(
                    current,
                    key,
                    "met",
                    allHomeUpgrades[item.homeId] ?? [],
                  ),
                );
            }}
          />
        )}
      </section>

      {dragPiece !== null && (
        <div
          className={`toy-drag-ghost toy-${dragPiece.id}`}
          style={{ left: dragPiece.x, top: dragPiece.y }}
        >
          <GameIcon
            name={
              UPGRADES.find((upgrade) => upgrade.id === dragPiece.id)?.icon ??
              "spark"
            }
            size={32}
          />
          <strong>{upgradeLabel(dragPiece.id)}</strong>
        </div>
      )}
    </>
  );
}

function compoundAt(x: number, y: number): CompoundId | null {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-compound-id]");
  const id = target?.dataset.compoundId;
  return id === "sunny" || id === "bluebell" || id === "mango" ? id : null;
}

function upgradeLabel(id: UpgradeId): string {
  return UPGRADES.find((upgrade) => upgrade.id === id)?.label ?? id;
}

function missingChallengeCatalogue(): never {
  throw new Error("Terra World requires at least one challenge");
}

type RestoredChallengeProgress = Readonly<{
  activeChallengeId: string;
  town: Record<CompoundId, readonly UpgradeId[]>;
  neighborhoodHomes: Record<string, readonly UpgradeId[]>;
  moves: number;
  hintsUsed: number;
  completedIds: readonly string[];
  bestStars: Readonly<Record<string, number>>;
}>;

function restoreChallengeProgress(): RestoredChallengeProgress | null {
  try {
    const serialized = window.localStorage.getItem(
      CHALLENGE_PROGRESS_STORAGE_KEY,
    );
    if (serialized === null) return null;
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== 1) return null;
    if (
      typeof value.activeChallengeId !== "string" ||
      challengeById(value.activeChallengeId) === null ||
      !isChallengeTown(value.town) ||
      !isBoundedInteger(value.moves, 0, 100) ||
      !isBoundedInteger(value.hintsUsed, 0, 50) ||
      !Array.isArray(value.completedIds) ||
      !isRecord(value.bestStars)
    )
      return null;

    const completedIds = value.completedIds.filter(
      (id): id is string =>
        typeof id === "string" && challengeById(id) !== null,
    );
    const bestStars = Object.fromEntries(
      Object.entries(value.bestStars).filter(
        ([id, stars]) =>
          challengeById(id) !== null && isBoundedInteger(stars, 1, 3),
      ),
    ) as Record<string, number>;

    return {
      activeChallengeId: value.activeChallengeId,
      town: value.town,
      neighborhoodHomes: restoreNeighborhoodHomes(value.neighborhoodHomes),
      moves: value.moves,
      hintsUsed: value.hintsUsed,
      completedIds,
      bestStars,
    };
  } catch {
    return null;
  }
}

function restoreNeighborhoodHomes(
  value: unknown,
): Record<string, readonly UpgradeId[]> {
  const initial = initialNeighborhoodState();
  if (!isRecord(value)) return initial;
  return Object.fromEntries(
    NEIGHBORHOOD_HOME_PROFILES.map((home) => {
      const upgrades = value[home.id];
      if (
        !Array.isArray(upgrades) ||
        upgrades.length > UPGRADES.length ||
        new Set(upgrades).size !== upgrades.length ||
        !upgrades.every(isHouseUpgradeId)
      )
        return [home.id, initial[home.id] ?? []];
      return [home.id, upgrades];
    }),
  );
}

function isChallengeTown(
  value: unknown,
): value is Record<CompoundId, readonly UpgradeId[]> {
  if (!isRecord(value)) return false;
  return COMPOUNDS.every((compound) => {
    const upgrades = value[compound.id];
    return (
      Array.isArray(upgrades) &&
      upgrades.length <= UPGRADES.length &&
      new Set(upgrades).size === upgrades.length &&
      upgrades.every(isHouseUpgradeId)
    );
  });
}

function isHouseUpgradeId(value: unknown): value is HouseUpgradeId {
  return (
    typeof value === "string" &&
    HOUSE_UPGRADE_IDS.some((upgrade) => upgrade === value)
  );
}

function preserveTownHelpers(
  setup: Readonly<Record<CompoundId, readonly string[]>>,
  current: Readonly<Record<CompoundId, readonly UpgradeId[]>>,
): Record<CompoundId, readonly UpgradeId[]> {
  const merge = (compoundId: CompoundId): readonly UpgradeId[] => {
    const core = setup[compoundId].filter(isHouseUpgradeId);
    const helpers = current[compoundId].filter(
      (upgrade) =>
        !CORE_HOUSE_UPGRADE_IDS.some((coreUpgrade) => coreUpgrade === upgrade),
    );
    return [...core, ...helpers];
  };
  return {
    sunny: merge("sunny"),
    bluebell: merge("bluebell"),
    mango: merge("mango"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

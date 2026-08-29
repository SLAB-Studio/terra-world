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
import ChallengeTrail from "./ChallengeTrail";
import { GameIcon } from "./GameIcon";
import HouseDiagnostics, {
  getHouseHealth,
  type HouseId,
  type HouseUpgradeId,
} from "./HouseDiagnostics";
import ImmersiveTownMap from "./ImmersiveTownMap";
import LivingMapDecor from "./LivingMapDecor";

type UpgradeId = HouseUpgradeId;
type CompoundId = HouseId;

type DragPiece = Readonly<{
  id: UpgradeId;
  x: number;
  y: number;
}>;

type CompoundWorldProps = Readonly<{
  backgroundInert?: boolean;
  onRiverMessage: (message: string) => void;
}>;

const UPGRADES: readonly {
  id: UpgradeId;
  label: string;
  hint: string;
  icon: Parameters<typeof GameIcon>[0]["name"];
}[] = [
  {
    id: "light",
    label: "Sun light",
    hint: "Lights the home",
    icon: "energy",
  },
  {
    id: "water",
    label: "Clean water",
    hint: "Helps plants grow",
    icon: "water",
  },
  {
    id: "garden",
    label: "Garden",
    hint: "Gives nature a home",
    icon: "nature",
  },
  {
    id: "recycle",
    label: "Recycle bin",
    hint: "Keeps the yard clean",
    icon: "recycle",
  },
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

const RIVER_MESSAGES: Readonly<Record<UpgradeId, string>> = {
  light:
    "Look! The windows and yard are glowing. Sunlight can make clean electricity without smoky air.",
  water:
    "The garden has clean water now. Plants need water, but saving every drop helps the whole town.",
  garden:
    "The garden is blooming! Flowers, trees, and vegetables give insects, birds, and families a healthier home.",
  recycle:
    "The yard is tidy! Sorting old things means less rubbish and more materials can be used again.",
};

const OWNER_HELP: Readonly<Record<UpgradeId, string>> = {
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

export default function CompoundWorld({
  backgroundInert = false,
  onRiverMessage,
}: CompoundWorldProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId>("light");
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
  const [dragPiece, setDragPiece] = useState<DragPiece | null>(null);
  const [hoveredCompound, setHoveredCompound] = useState<CompoundId | null>(
    null,
  );
  const [townAwake, setTownAwake] = useState(false);
  const dragPieceRef = useRef<DragPiece | null>(null);
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
    function move(event: PointerEvent) {
      const active = dragPieceRef.current;
      if (active === null) return;
      const next = { ...active, x: event.clientX, y: event.clientY };
      dragPieceRef.current = next;
      setDragPiece(next);
      setHoveredCompound(compoundAt(event.clientX, event.clientY));
    }

    function release(event: PointerEvent) {
      const active = dragPieceRef.current;
      if (active === null) return;
      const target = compoundAt(event.clientX, event.clientY);
      dragPieceRef.current = null;
      setDragPiece(null);
      setHoveredCompound(null);
      if (target !== null) addUpgrade(target, active.id);
    }

    function cancel() {
      dragPieceRef.current = null;
      setDragPiece(null);
      setHoveredCompound(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
    };
  });

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
      setAttemptComplete(isChallengeComplete(restoredChallenge, restored.town));
    }
    setChallengeProgressReady(true);
  }, []);

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
  ]);

  function addUpgrade(compoundId: CompoundId, upgradeId: UpgradeId) {
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
        `${home?.family ?? "This home"} added ${upgradeLabel(upgradeId).toLowerCase()}. ${RIVER_MESSAGES[upgradeId]}`,
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
          `Challenge complete! ${activeChallenge.learning} You earned ${stars} ${stars === 1 ? "leaf" : "leaves"}.`,
        );
      }
    } else {
      onRiverMessage(
        `${upgradeLabel(upgradeId)} is already helping this home. Try it on another compound!`,
      );
    }
  }

  function startChallenge(challengeId: string) {
    const challenge = challengeById(challengeId);
    if (
      challenge === null ||
      !isChallengeUnlocked(challenge.id, completedChallengeIds)
    )
      return;
    setActiveChallengeId(challenge.id);
    setCompounds(copyChallengeSetup(challenge));
    setChallengeMoves(0);
    setChallengeHintsUsed(0);
    setAttemptComplete(false);
    setCompletionNotice(null);
    setSelectedCompound(null);
    setChallengeTrailOpen(false);
    onRiverMessage(`${challenge.story} ${challenge.instruction}`);
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
    setSelectedUpgrade(upgradeId);
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
        "Every home is shining with clean energy! What could you add next to help all three gardens?",
      );
    } else if (completedActions === 0) {
      onRiverMessage(
        "The town is waiting for your first idea. Drag Sun light onto a home and watch its windows glow!",
      );
    } else {
      onRiverMessage(
        `${litHomes} of ${COMPOUNDS.length} homes can shine tonight. Can you help another home?`,
      );
    }
  }

  return (
    <>
      <aside
        aria-hidden={backgroundInert || undefined}
        className="toy-box"
        inert={backgroundInert || undefined}
        aria-labelledby="toy-box-heading"
      >
        <div className="toy-box-heading">
          <span aria-hidden="true">☀</span>
          <div>
            <h1 id="toy-box-heading">Things to add</h1>
            <p>Drag one to a home</p>
          </div>
        </div>
        <div className="toy-shelf">
          {UPGRADES.map((upgrade) => (
            <button
              aria-pressed={selectedUpgrade === upgrade.id}
              className={`toy-piece toy-${upgrade.id}`}
              key={upgrade.id}
              onClick={() => setSelectedUpgrade(upgrade.id)}
              onPointerDown={(event) => startDrag(event, upgrade.id)}
              type="button"
            >
              <span className="toy-piece-icon">
                <GameIcon name={upgrade.icon} size={36} />
              </span>
              <span>
                <strong>{upgrade.label}</strong>
                <small>{upgrade.hint}</small>
              </span>
            </button>
          ))}
        </div>
        <p className="toy-box-tip">
          <span aria-hidden="true">☝</span>
          Drag a piece to a home. Tap a home for its check-up.
        </p>
      </aside>

      <section
        aria-hidden={backgroundInert || undefined}
        className={`neighborhood-panel${townAwake ? " town-awake" : ""}${challengeTrailOpen ? " challenge-trail-open" : ""}`}
        inert={backgroundInert || undefined}
        aria-labelledby="neighborhood-heading"
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
              Trail
            </button>
          </div>
        </header>

        <div
          aria-hidden={challengeTrailOpen || undefined}
          className="neighborhood-world"
          inert={challengeTrailOpen || undefined}
        >
          <div
            aria-label="Scrollable Terra World neighborhood map"
            className="world-scroll-region"
            ref={worldScrollRef}
            role="region"
            tabIndex={0}
          >
            <div className="world-canvas">
              <ImmersiveTownMap />
              <span className="world-river" aria-hidden="true">
                <i className="river-shimmer river-shimmer-one" />
                <i className="river-shimmer river-shimmer-two" />
              </span>
              <LivingMapDecor />
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
                      aria-label={`${compound.name}. ${health.healthyCount} of ${health.totalCount} parts feel good. Open home check-up.`}
                      className={`compound compound-${compound.id}${
                        hoveredCompound === compound.id ? " is-drop-target" : ""
                      }${isLit ? " is-lit" : ""}${
                        isWatered ? " is-watered" : ""
                      }${isGardened ? " is-gardened" : ""}${
                        isRecycling ? " is-recycling" : ""
                      }${health.allHealthy ? " is-healthy" : " needs-help"}`}
                      data-compound-id={compound.id}
                      key={compound.id}
                      onClick={() => setSelectedCompound(compound.id)}
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
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="map-pan-hint">
            <span aria-hidden="true">↔</span>
            Scroll or swipe to explore
          </p>
        </div>

        <footer
          aria-hidden={challengeTrailOpen || undefined}
          className="neighborhood-actions"
          inert={challengeTrailOpen || undefined}
        >
          <p aria-live="polite">
            {completedActions === 0
              ? "Start with one small change."
              : `${completedActions} kind change${completedActions === 1 ? "" : "s"} added to the neighborhood.`}
          </p>
          <button onClick={runTown} type="button">
            <GameIcon name="play" size={22} />
            Watch the town!
          </button>
        </footer>

        {completionNotice !== null && !challengeTrailOpen && (
          <div className="challenge-complete-toast" aria-live="polite">
            <span className="challenge-complete-mark" aria-hidden="true">
              <GameIcon name="nature" size={27} />
            </span>
            <div>
              <strong>Challenge complete!</strong>
              <span>
                {completionNotice.stars}{" "}
                {completionNotice.stars === 1 ? "leaf" : "leaves"} earned
              </span>
            </div>
            <button onClick={startNextChallenge} type="button">
              {nextChallengeId(completionNotice.challengeId) === null
                ? "See my trail"
                : "Next challenge"}
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

      <HouseDiagnostics
        houseId={selectedCompound ?? "sunny"}
        onChooseUpgrade={(houseId, upgradeId) => addUpgrade(houseId, upgradeId)}
        onClose={() => setSelectedCompound(null)}
        open={selectedCompound !== null}
        upgrades={compounds[selectedCompound ?? "sunny"]}
      />
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
      moves: value.moves,
      hintsUsed: value.hintsUsed,
      completedIds,
      bestStars,
    };
  } catch {
    return null;
  }
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
      upgrades.every(
        (upgrade) =>
          upgrade === "light" ||
          upgrade === "water" ||
          upgrade === "garden" ||
          upgrade === "recycle",
      )
    );
  });
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

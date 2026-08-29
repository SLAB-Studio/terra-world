"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { GameIcon } from "./GameIcon";

type UpgradeId = "light" | "water" | "garden" | "recycle";
type CompoundId = "sunny" | "bluebell" | "mango";

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

function emptyCompoundState(): Record<CompoundId, readonly UpgradeId[]> {
  return { sunny: [], bluebell: [], mango: [] };
}

export default function CompoundWorld({
  backgroundInert = false,
  onRiverMessage,
}: CompoundWorldProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId>("light");
  const [compounds, setCompounds] = useState(emptyCompoundState);
  const [dragPiece, setDragPiece] = useState<DragPiece | null>(null);
  const [hoveredCompound, setHoveredCompound] = useState<CompoundId | null>(
    null,
  );
  const [townAwake, setTownAwake] = useState(false);
  const dragPieceRef = useRef<DragPiece | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);

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

  function addUpgrade(compoundId: CompoundId, upgradeId: UpgradeId) {
    if (!compounds[compoundId].includes(upgradeId)) {
      setCompounds((current) => ({
        ...current,
        [compoundId]: [...current[compoundId], upgradeId],
      }));
      const home = COMPOUNDS.find((compound) => compound.id === compoundId);
      onRiverMessage(
        `${home?.family ?? "This home"} added ${upgradeLabel(upgradeId).toLowerCase()}. ${RIVER_MESSAGES[upgradeId]}`,
      );
    } else {
      onRiverMessage(
        `${upgradeLabel(upgradeId)} is already helping this home. Try it on another compound!`,
      );
    }
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

  const questText =
    litHomes === COMPOUNDS.length
      ? "Every home is shining!"
      : litHomes === 0
        ? "Drag Sun light onto a home"
        : `Help ${COMPOUNDS.length - litHomes} more home${COMPOUNDS.length - litHomes === 1 ? "" : "s"} shine`;

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
          You can also tap a piece, then tap a home.
        </p>
      </aside>

      <section
        aria-hidden={backgroundInert || undefined}
        className={`neighborhood-panel${townAwake ? " town-awake" : ""}`}
        inert={backgroundInert || undefined}
        aria-labelledby="neighborhood-heading"
      >
        <header className="neighborhood-quest">
          <div>
            <span className="quest-kicker">Today&apos;s little quest</span>
            <h2 id="neighborhood-heading">{questText}</h2>
          </div>
          <div
            className="quest-suns"
            aria-label={`${litHomes} of 3 homes shining`}
          >
            {COMPOUNDS.map((compound) => (
              <span
                className={
                  compounds[compound.id].includes("light") ? "is-on" : ""
                }
                key={compound.id}
                aria-hidden="true"
              >
                ☀
              </span>
            ))}
          </div>
        </header>

        <div className="neighborhood-world">
          <span className="world-river" aria-hidden="true">
            <i className="river-shimmer river-shimmer-one" />
            <i className="river-shimmer river-shimmer-two" />
          </span>
          <span className="map-tree map-tree-one" aria-hidden="true">
            <i />
          </span>
          <span className="map-tree map-tree-two" aria-hidden="true">
            <i />
          </span>
          <span className="map-tree map-tree-three" aria-hidden="true">
            <i />
          </span>
          <div className="compound-grid">
            {COMPOUNDS.map((compound) => {
              const upgrades = compounds[compound.id];
              const isLit = upgrades.includes("light");
              const isWatered = upgrades.includes("water");
              const isGardened = upgrades.includes("garden");
              const isRecycling = upgrades.includes("recycle");
              return (
                <button
                  aria-label={`${compound.name}. ${upgrades.length === 0 ? "No additions yet." : `${upgrades.map(upgradeLabel).join(", ")} added.`} Add ${upgradeLabel(selectedUpgrade)}.`}
                  className={`compound compound-${compound.id}${
                    hoveredCompound === compound.id ? " is-drop-target" : ""
                  }${isLit ? " is-lit" : ""}${isWatered ? " is-watered" : ""}${
                    isGardened ? " is-gardened" : ""
                  }${isRecycling ? " is-recycling" : ""}`}
                  data-compound-id={compound.id}
                  key={compound.id}
                  onClick={() => addUpgrade(compound.id, selectedUpgrade)}
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
                    <span className="compound-fence fence-left" />
                    <span className="compound-fence fence-right" />
                  </span>
                  <span className="compound-name">
                    <strong>{compound.family}</strong>
                    <small>{compound.garden} garden</small>
                  </span>
                  <span className="compound-drop-prompt">
                    {hoveredCompound === compound.id
                      ? `Drop ${upgradeLabel(selectedUpgrade)}!`
                      : `Add ${upgradeLabel(selectedUpgrade)}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="map-guide-bubble" aria-live="polite">
            <span className="map-guide-face" aria-hidden="true">
              <i />
              <i />
              <b />
            </span>
            <p>
              <strong>{questText}.</strong>
              {litHomes === 0
                ? " Give one home clean sunlight and watch it glow!"
                : " Nice work! Which home should we help next?"}
            </p>
          </div>
        </div>

        <footer className="neighborhood-actions">
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

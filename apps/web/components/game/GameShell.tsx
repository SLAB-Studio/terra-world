"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Coordinate } from "@terra/campaign-schema";
import { RIVERGATE_EN_MESSAGES } from "@terra/simulation";

import { buildingName, CATEGORY_NAMES } from "../../lib/game/catalogue";
import {
  BUILDING_CATALOGUE,
  OVERLAY_IDS,
  createDeveloperGame,
  createGameSessionSave,
  getChildFeedback,
  getCurrentMission,
  gameReducer,
  getUnlockedChapterIds,
  getOverlayView,
  getPlanningCity,
  getCursorSummary,
  operationCount,
  provisionalCost,
  restoreGameSession,
  type OverlayId,
} from "../../lib/game/controller";
import {
  createOfflinePersistence,
  type OfflinePersistence,
} from "../../lib/offline";
import { GameIcon } from "./GameIcon";
import type { GameMapApi } from "./GameMap";

const GameMap = dynamic(() => import("./GameMap"), {
  ssr: false,
  loading: () => (
    <div className="map-state" role="status">
      <span className="map-loader" aria-hidden="true" />
      <strong>Preparing Rivergate…</strong>
      <span>Your river valley is getting ready.</span>
    </div>
  ),
});

type DragGhost = {
  readonly buildingId: string;
  readonly x: number;
  readonly y: number;
};

const RIVERGATE_CITY_ID = "rivergate-city";

const OVERLAY_SHORT_NAMES: Readonly<Record<OverlayId, string>> = {
  validity: "Build",
  flood: "Flood",
  water: "Water",
  electricity: "Power",
  transport: "Travel",
  service: "Services",
  habitat: "Habitat",
  cost: "Cost",
};

export default function GameShell() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createDeveloperGame(),
  );
  const [mapApi, setMapApi] = useState<GameMapApi | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const dragGhostRef = useRef<DragGhost | null>(null);
  const persistenceRef = useRef<OfflinePersistence | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [persistenceReady, setPersistenceReady] = useState(false);
  const planningCity = useMemo(() => getPlanningCity(state), [state]);
  const overlay = useMemo(() => getOverlayView(state), [state]);
  const cursorSummary = useMemo(() => getCursorSummary(state), [state]);
  const currentMission = useMemo(() => getCurrentMission(state), [state]);
  const childFeedback = useMemo(() => getChildFeedback(state), [state]);
  const unlockedChapterIds = useMemo(
    () => getUnlockedChapterIds(state),
    [state],
  );
  const selected = BUILDING_CATALOGUE.find(
    (building) => building.id === state.selectedBuildingId,
  );
  const costs = provisionalCost(state);
  const changes = operationCount(state);

  useEffect(() => {
    let disposed = false;
    void createOfflinePersistence()
      .then(async (persistence) => {
        if (disposed) {
          persistence.close();
          return;
        }
        persistenceRef.current = persistence;
        const saved = await persistence.getCampaignSession(RIVERGATE_CITY_ID);
        if (saved !== null) {
          try {
            dispatch({ type: "restore", state: restoreGameSession(saved) });
          } catch {
            await persistence.deleteCampaignSession(RIVERGATE_CITY_ID);
            dispatch({
              type: "restore",
              state: {
                ...createDeveloperGame(),
                status:
                  "Rivergate started a fresh safe save after it could not restore the previous one.",
              },
            });
          }
        }
        if (!disposed) setPersistenceReady(true);
      })
      .catch(() => {
        if (!disposed) setPersistenceReady(true);
      });
    return () => {
      disposed = true;
      persistenceRef.current?.close();
      persistenceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const persistence = persistenceRef.current;
    if (!persistenceReady || persistence === null) return;
    const savedAt = Date.now();
    const session = createGameSessionSave(state, savedAt);
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await Promise.all([
          persistence.saveCampaignSession(session),
          persistence.saveCity({
            cityId: state.city.cityId,
            committedAt: savedAt,
            state: state.city,
          }),
          persistence.saveActionLog({
            cityId: state.city.cityId,
            savedAt,
            actions: state.city.actionLog,
          }),
        ]);
      })
      .catch(() => undefined);
  }, [persistenceReady, state]);

  const handleTileActivate = useCallback(
    (coordinate: Coordinate) => {
      dispatch({ type: "set-cursor", coordinate });
      if (state.selectedBuildingId !== null)
        dispatch({ type: "place", coordinate });
    },
    [state.selectedBuildingId],
  );

  useEffect(() => {
    function move(event: PointerEvent) {
      const active = dragGhostRef.current;
      if (active === null) return;
      const next = { ...active, x: event.clientX, y: event.clientY };
      dragGhostRef.current = next;
      setDragGhost(next);
    }
    function release(event: PointerEvent) {
      const active = dragGhostRef.current;
      if (active === null) return;
      dragGhostRef.current = null;
      setDragGhost(null);
      const coordinate = mapApi?.screenToTile(event.clientX, event.clientY);
      if (coordinate !== null && coordinate !== undefined)
        dispatch({ type: "place", coordinate });
    }
    function cancel() {
      if (dragGhostRef.current === null) return;
      dragGhostRef.current = null;
      setDragGhost(null);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [mapApi]);

  function beginCatalogueDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    buildingId: string,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dispatch({ type: "select", buildingId });
    const next = { buildingId, x: event.clientX, y: event.clientY };
    dragGhostRef.current = next;
    setDragGhost(next);
  }

  function handleMapKey(event: KeyboardEvent<HTMLDivElement>) {
    const movement: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = movement[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      dispatch({ type: "move-cursor", dx: delta[0], dy: delta[1] });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dispatch({ type: "place", coordinate: state.cursor });
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      dispatch({ type: "rotate" });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      dispatch({ type: "remove", coordinate: state.cursor });
    } else if (event.key === "Escape") {
      dispatch({ type: "clear-selection" });
    }
  }

  if (!persistenceReady) {
    return (
      <main className="game-shell">
        <div className="map-state" role="status">
          <span className="map-loader" aria-hidden="true" />
          <strong>Restoring Rivergate…</strong>
          <span>Checking your saved city before play begins.</span>
        </div>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <strong>Terra World</strong>
            <span>Rivergate · build a city that cares</span>
          </div>
        </div>
        <dl className="city-facts" aria-label="Rivergate status">
          <div>
            <dt>Turn</dt>
            <dd>{state.city.turn}</dd>
          </div>
          <div>
            <dt>Population</dt>
            <dd>{state.city.population}</dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>${state.city.budget.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd className={costs > 0 ? "fact-cost" : undefined}>
              −${costs.toLocaleString()}
            </dd>
          </div>
        </dl>
      </header>

      <section
        className="game-workspace"
        aria-label="Rivergate planning workspace"
      >
        <aside className="catalogue-panel" aria-labelledby="catalogue-heading">
          <div className="panel-heading">
            <h1 id="catalogue-heading">Build Rivergate</h1>
            <p>Choose an item, then click or drag it onto the map.</p>
          </div>
          <div className="catalogue-scroll">
            {Object.entries(CATEGORY_NAMES).map(([category, label]) => {
              const items = BUILDING_CATALOGUE.filter(
                (item) => item.category === category,
              );
              if (items.length === 0) return null;
              return (
                <section
                  className="catalogue-group"
                  aria-labelledby={`category-${category}`}
                  key={category}
                >
                  <h2 id={`category-${category}`}>{label}</h2>
                  <div className="catalogue-grid">
                    {items.map((item) => (
                      <CatalogueItem
                        isUnlocked={isBuildingUnlocked(
                          item,
                          unlockedChapterIds,
                        )}
                        item={item}
                        key={item.id}
                        onSelect={() =>
                          dispatch({ type: "select", buildingId: item.id })
                        }
                        onStartDrag={(event) =>
                          beginCatalogueDrag(event, item.id)
                        }
                        selected={state.selectedBuildingId === item.id}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </aside>

        <section className="map-panel" aria-labelledby="map-heading">
          <div className="map-toolbar">
            <div>
              <h2 id="map-heading">Rivergate valley</h2>
              <p>
                {selected === undefined
                  ? "Explore the map"
                  : `${buildingName(selected.id)} · ${state.rotation}° · tile ${state.cursor.x + 1}, ${state.cursor.y + 1}`}
              </p>
            </div>
            <div className="map-actions" aria-label="Plan actions">
              <button
                disabled={
                  selected === undefined || selected.allowedRotations.length < 2
                }
                onClick={() => dispatch({ type: "rotate" })}
                type="button"
              >
                <GameIcon name="rotate" />
                <span>Rotate</span>
              </button>
              <button
                disabled={changes === 0}
                onClick={() => dispatch({ type: "undo" })}
                type="button"
              >
                <GameIcon name="undo" />
                <span>Undo</span>
              </button>
              <button
                onClick={() =>
                  dispatch({ type: "remove", coordinate: state.cursor })
                }
                type="button"
              >
                <GameIcon name="remove" />
                <span>Remove</span>
              </button>
            </div>
          </div>
          <div
            aria-describedby="map-help map-cursor-summary map-status"
            aria-label="Rivergate build map. Use arrow keys to move the white tile cursor. Press Enter to place, R to rotate, and Delete to remove."
            className="map-stage"
            onKeyDown={handleMapKey}
            role="group"
            tabIndex={0}
          >
            {mapError === null ? (
              <GameMap
                city={planningCity}
                cursor={state.cursor}
                onError={setMapError}
                onReady={setMapApi}
                onTileActivate={handleTileActivate}
                overlay={overlay}
                rotation={state.rotation}
                selectedBuildingId={state.selectedBuildingId}
              />
            ) : (
              <div className="map-state map-state-error" role="alert">
                <strong>The Rivergate map could not open.</strong>
                <span>{mapError}</span>
                <button onClick={() => window.location.reload()} type="button">
                  Reload map
                </button>
              </div>
            )}
            <div className="map-compass" aria-hidden="true">
              <span>N</span>
              <i />
            </div>
            <p className="sr-only" id="map-help">
              Arrow keys move the tile cursor. Enter places the selected item. R
              rotates it. Delete removes the item under the cursor.
            </p>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="sr-only"
              id="map-cursor-summary"
            >
              {cursorSummary}
            </p>
          </div>
          <div className="map-statusbar">
            <p aria-live="polite" id="map-status">
              <span className="status-dot" aria-hidden="true" />
              {state.status}
            </p>
            <span>Drag to pan · scroll to zoom</span>
          </div>
        </section>

        <aside className="planning-panel" aria-label="Planning tools">
          {state.ending !== null ? (
            <EndingCard ending={state.ending} />
          ) : (
            <MissionCard
              feedback={childFeedback}
              mission={currentMission}
              progress={state.campaign.completedMissionKeys.length}
            />
          )}

          <section
            className="overlay-section"
            aria-labelledby="overlays-heading"
          >
            <div className="section-heading">
              <GameIcon name="layers" />
              <div>
                <h2 id="overlays-heading">Planning lens</h2>
                <p>Switch views to check your plan.</p>
              </div>
            </div>
            <div className="overlay-buttons">
              {OVERLAY_IDS.map((overlayId) => (
                <button
                  aria-pressed={state.overlay === overlayId}
                  key={overlayId}
                  onClick={() =>
                    dispatch({ type: "set-overlay", overlay: overlayId })
                  }
                  type="button"
                >
                  <span
                    className={`pattern-swatch pattern-${patternFor(overlayId)}`}
                    aria-hidden="true"
                  />
                  {OVERLAY_SHORT_NAMES[overlayId]}
                </button>
              ))}
            </div>
            <div className="overlay-legend">
              <strong>{overlay.name}</strong>
              <p>{overlay.description}</p>
            </div>
          </section>

          <section
            className="systems-section"
            aria-labelledby="systems-heading"
          >
            <h2 id="systems-heading">City systems</h2>
            <div className="system-list">
              {Object.entries(state.city.indicators).map(([name, value]) => (
                <div className="system-row" key={name}>
                  <span>{capitalize(name)}</span>
                  <div
                    className="meter"
                    aria-label={`${capitalize(name)} ${Math.round(value)} percent`}
                  >
                    <i style={{ width: `${Math.max(3, value)}%` }} />
                  </div>
                  <strong>{Math.round(value)}</strong>
                </div>
              ))}
            </div>
          </section>

          <div className="commit-area">
            {changes === 0 ? (
              <p className="empty-plan">
                No new buildings planned. Run the city to let time pass.
              </p>
            ) : (
              <p>
                <strong>
                  {changes} provisional {changes === 1 ? "change" : "changes"}
                </strong>
                <span>Nothing becomes permanent until you run the city.</span>
              </p>
            )}
            <button
              className="commit-button"
              disabled={state.campaign.phase === "completed"}
              onClick={() => dispatch({ type: "commit" })}
              type="button"
            >
              <GameIcon name="play" />
              <span>Run the city</span>
            </button>
          </div>
        </aside>
      </section>

      {dragGhost !== null && (
        <div
          className="drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          <GameIcon name={iconFor(dragGhost.buildingId)} />
          <span>{buildingName(dragGhost.buildingId)}</span>
        </div>
      )}
    </main>
  );
}

type CatalogueItemProps = {
  readonly item: (typeof BUILDING_CATALOGUE)[number];
  readonly isUnlocked: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onStartDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function CatalogueItem({
  item,
  isUnlocked,
  onSelect,
  onStartDrag,
  selected,
}: CatalogueItemProps) {
  const prerequisiteChapter = requiredChapterFor(item);
  const lockMessage =
    prerequisiteChapter === null
      ? ""
      : `Finish ${chapterLabel(prerequisiteChapter)} to unlock this.`;

  return (
    <button
      aria-label={
        isUnlocked
          ? undefined
          : `${buildingName(item.id)} is locked. ${lockMessage}`
      }
      aria-pressed={selected}
      className="catalogue-item"
      disabled={!isUnlocked}
      onClick={onSelect}
      onPointerDown={onStartDrag}
      type="button"
    >
      <span className={`catalogue-icon category-${item.category}`}>
        <GameIcon name={iconFor(item.id)} />
      </span>
      <span className="catalogue-copy">
        <strong>{buildingName(item.id)}</strong>
        <span>
          ${item.constructionCost} · ${item.maintenanceCost}/turn
        </span>
        {!isUnlocked && <em className="catalogue-lock">{lockMessage}</em>}
      </span>
    </button>
  );
}

type MissionCardProps = {
  readonly mission: ReturnType<typeof getCurrentMission>;
  readonly feedback: ReturnType<typeof getChildFeedback>;
  readonly progress: number;
};

function MissionCard({ feedback, mission, progress }: MissionCardProps) {
  if (mission === null) return null;

  return (
    <section className="mission-section" aria-labelledby="mission-heading">
      <div className="mission-heading-row">
        <div>
          <p className="mission-position">
            {chapterLabel(mission.chapterId)} · Mission {progress + 1} of 15
          </p>
          <h2 id="mission-heading">{mission.title}</h2>
        </div>
        <span
          className={
            mission.requiredComplete ? "mission-ready" : "mission-next"
          }
        >
          {mission.requiredComplete ? "Ready" : "In progress"}
        </span>
      </div>
      <p className="mission-briefing">{mission.briefing}</p>
      <p
        className="mission-progress"
        aria-label={`${progress} of 15 missions complete`}
      >
        <strong>{progress}/15</strong> missions complete
      </p>
      <ul className="objective-list" aria-label="Mission objectives">
        {mission.objectives.map((objective) => (
          <li
            className={
              objective.completed ? "objective-complete" : "objective-pending"
            }
            key={objective.id}
          >
            <span className="objective-state" aria-hidden="true" />
            <span>
              <span className="sr-only">
                {objective.completed ? "Complete: " : "Still to do: "}
              </span>
              {objective.description}
              <small>{objective.required ? "Needed" : "Bonus"}</small>
            </span>
          </li>
        ))}
      </ul>
      {feedback !== null && (
        <div className="mission-feedback" aria-label="Rivergate guide">
          <p>
            <strong>What Rivergate noticed</strong>
            {feedback.explanation}
          </p>
          <p>
            <strong>Think about it</strong>
            {feedback.question}
          </p>
          <p>
            <strong>Try next</strong>
            {feedback.hint}
          </p>
        </div>
      )}
    </section>
  );
}

type EndingCardProps = {
  readonly ending: NonNullable<
    ReturnType<typeof createDeveloperGame>["ending"]
  >;
};

function EndingCard({ ending }: EndingCardProps) {
  return (
    <section className="ending-section" aria-labelledby="ending-heading">
      <p className="mission-position">Rivergate story complete</p>
      <h2 id="ending-heading">{messageFor(ending.titleKey)}</h2>
      <p className="ending-summary">{messageFor(ending.childSummaryKey)}</p>
      <div className="ending-systems" aria-label="Rivergate systems">
        <p>
          <strong>Strongest</strong>
          <span>{capitalize(ending.strongestSystem.system)}</span>
        </p>
        <p>
          <strong>Next to strengthen</strong>
          <span>{capitalize(ending.weakestSystem.system)}</span>
        </p>
      </div>
      {ending.traits.length > 0 && (
        <div className="ending-traits">
          <strong>What you earned</strong>
          <ul>
            {ending.traits.map((trait) => (
              <li key={trait.traitId}>{messageFor(trait.titleKey)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="ending-reflection">
        <strong>Think back</strong>
        {messageFor(ending.adultLearningSummary.reflectionKey)}
      </p>
    </section>
  );
}

function iconFor(id: string): Parameters<typeof GameIcon>[0]["name"] {
  if (id === "home") return "home";
  if (id === "road") return "road";
  if (id.includes("water")) return "water";
  if (id === "solar-array" || id === "battery") return "energy";
  if (id === "school") return "school";
  if (id === "clinic") return "clinic";
  if (id === "bus-stop") return "bus";
  if (id === "recycling-centre") return "recycle";
  return "nature";
}

function patternFor(id: OverlayId): string {
  return id === "validity" || id === "electricity"
    ? "cross"
    : id === "flood" || id === "transport" || id === "cost"
      ? "lines"
      : "dots";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function requiredChapterFor(
  item: (typeof BUILDING_CATALOGUE)[number],
): string | null {
  const prerequisite = item.prerequisites.find(
    (candidate) => candidate.type === "chapter-unlocked",
  );
  return prerequisite !== undefined && prerequisite.type === "chapter-unlocked"
    ? prerequisite.chapterId
    : null;
}

function isBuildingUnlocked(
  item: (typeof BUILDING_CATALOGUE)[number],
  unlockedChapterIds: readonly string[],
): boolean {
  const prerequisiteChapter = requiredChapterFor(item);
  return (
    prerequisiteChapter === null ||
    unlockedChapterIds.includes(prerequisiteChapter)
  );
}

function chapterLabel(chapterId: string): string {
  const labels: Readonly<Record<string, string>> = {
    "chapter-1-water": "Chapter 1 · Water",
    "chapter-2-power": "Chapter 2 · Power",
    "chapter-3-care": "Chapter 3 · Care",
    "chapter-4-growth": "Chapter 4 · Growth",
    "chapter-5-storm": "Chapter 5 · Storm",
  };
  return labels[chapterId] ?? "This chapter";
}

function messageFor(key: string): string {
  return RIVERGATE_EN_MESSAGES[key] ?? key;
}

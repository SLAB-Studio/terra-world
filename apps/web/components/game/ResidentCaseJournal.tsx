"use client";

import { useEffect, useRef, useState } from "react";
import {
  CASE_HOME_IDS,
  RESIDENT_CASES,
  caseEntry,
  caseStage,
  currentCaseForHome,
  residentCaseByKey,
  type CaseworkProgress,
  type CaseStage,
  type ResidentCase,
} from "../../lib/immersive-town/neighborhood-casework";
import { GameIcon } from "./GameIcon";
import styles from "./ResidentCaseJournal.module.css";

type Props = Readonly<{
  open: boolean;
  timeOfDay: "day" | "night";
  progress: CaseworkProgress;
  upgradesByHome: Readonly<Record<string, readonly string[]>>;
  selectedCaseKey: string | null;
  storageNotice: string | null;
  onOpen(): void;
  onClose(): void;
  onSelect(key: string): void;
  onVisit(item: ResidentCase): void;
  onReadRequest(key: string): void;
}>;

const STAGE_LABELS: Record<CaseStage, string> = {
  meet: "Hear their request",
  inspect: "Inspect the home",
  repair: "Repair needed",
  "follow-up": "Return for a check-in",
  complete: "Checked in",
};

/** A restrained notebook beside the city, never a replacement for the visit. */
export default function ResidentCaseJournal({
  open,
  timeOfDay,
  progress,
  upgradesByHome,
  selectedCaseKey,
  storageNotice,
  onOpen,
  onClose,
  onSelect,
  onVisit,
  onReadRequest,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [showHomes, setShowHomes] = useState(false);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [question, setQuestion] = useState<"request" | "routine">("request");
  const item =
    selectedCaseKey === null ? undefined : residentCaseByKey(selectedCaseKey);
  const homes = CASE_HOME_IDS.map((id) =>
    currentCaseForHome(id, progress, upgradesByHome[id] ?? []),
  ).filter((home): home is ResidentCase => home !== undefined);
  const openHomes = homes.filter(
    (home) =>
      caseStage(home, progress, upgradesByHome[home.homeId] ?? []) !==
      "complete",
  );
  const visibleHomes = filter === "open" ? openHomes : homes;
  const previousCheckIns = RESIDENT_CASES.filter(
    (home) =>
      caseStage(home, progress, upgradesByHome[home.homeId] ?? []) ===
      "complete",
  );

  useEffect(() => {
    if (!open) return;
    setQuestion("request");
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  function closeJournal() {
    onClose();
    window.requestAnimationFrame(() => {
      const target = returnFocusRef.current;
      if (target?.isConnected && !target.closest("[inert]"))
        target.focus({ preventScroll: true });
      else launcherRef.current?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    setQuestion("request");
    setShowHomes(selectedCaseKey === null);
  }, [selectedCaseKey]);

  const entry = item ? caseEntry(progress, item.key) : null;
  const installed = item ? (upgradesByHome[item.homeId] ?? []) : [];
  const repaired = item !== undefined && installed.includes(item.need);
  const stage = item ? caseStage(item, progress, installed) : null;

  return (
    <div className={styles.root} data-time-of-day={timeOfDay}>
      <button
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        aria-controls="resident-case-journal"
        onClick={open ? closeJournal : onOpen}
        ref={launcherRef}
      >
        <GameIcon name="layers" size={18} />
        Resident journal
        {openHomes.length > 0 ? <span>{openHomes.length}</span> : null}
      </button>
      {open ? (
        <section
          id="resident-case-journal"
          role="dialog"
          aria-label="Resident journal"
          aria-modal="false"
          className={styles.panel}
          ref={panelRef}
          onKeyDown={(event) => {
            // Keep the canvas's movement shortcuts away from this reading surface.
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              closeJournal();
            }
          }}
        >
          <header className={styles.header}>
            <h2>Resident journal</h2>
            <button
              type="button"
              aria-label="Close resident journal"
              onClick={closeJournal}
              ref={closeRef}
            >
              <GameIcon name="close" size={20} />
            </button>
          </header>
          <div className={styles.scroll}>
            {storageNotice ? (
              <p className={styles.notice} role="status">
                {storageNotice}
              </p>
            ) : null}
            <div className={styles.directoryHeading}>
              <button
                type="button"
                aria-expanded={showHomes}
                onClick={() => setShowHomes((value) => !value)}
              >
                {showHomes ? "Hide home list" : "Choose a resident"}
              </button>
              <span>
                {homes.length - openHomes.length} of {homes.length} homes
                checked in
              </span>
            </div>
            {showHomes ? (
              <nav className={styles.directory} aria-label="Resident cases">
                <div
                  className={styles.filters}
                  role="group"
                  aria-label="Filter homes"
                >
                  <button
                    type="button"
                    aria-pressed={filter === "open"}
                    onClick={() => setFilter("open")}
                  >
                    Open visits
                  </button>
                  <button
                    type="button"
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    All homes
                  </button>
                </div>
                {visibleHomes.length === 0 ? (
                  <p>
                    Every home has had a check-in. Choose All homes to read
                    their stories again.
                  </p>
                ) : (
                  <ul>
                    {visibleHomes.map((home) => (
                      <li key={home.homeId}>
                        <button
                          type="button"
                          aria-current={
                            home.key === selectedCaseKey ? "true" : undefined
                          }
                          onClick={() => {
                            onSelect(home.key);
                            setShowHomes(false);
                          }}
                        >
                          <span>
                            <strong>{home.ownerName}</strong>
                            <small>{home.homeName}</small>
                          </span>
                          <span>
                            {
                              STAGE_LABELS[
                                caseStage(
                                  home,
                                  progress,
                                  upgradesByHome[home.homeId] ?? [],
                                )
                              ]
                            }
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            ) : null}
            {item && entry && stage ? (
              <article className={styles.case}>
                <div className={styles.resident}>
                  <span className={styles.initial} aria-hidden="true">
                    {item.ownerName.slice(0, 1)}
                  </span>
                  <div>
                    <h3>{item.ownerName}</h3>
                    <p>{item.homeName}</p>
                  </div>
                  <span className={styles.stage}>{STAGE_LABELS[stage]}</span>
                </div>
                <h4>{item.title}</h4>
                <blockquote aria-live="polite">
                  <p>
                    {question === "routine"
                      ? item.routine
                      : stage === "complete"
                        ? item.feedback
                        : repaired
                          ? "The upgrade is in place. Come by, take a look, and we can catch up about the home."
                          : item.request}
                  </p>
                  <footer>{item.ownerName}</footer>
                </blockquote>
                <div
                  className={styles.questions}
                  role="group"
                  aria-label={`Read ${item.ownerName}'s story`}
                >
                  <button
                    type="button"
                    aria-pressed={question === "request"}
                    onClick={() => {
                      setQuestion("request");
                      onReadRequest(item.key);
                    }}
                  >
                    {stage === "complete"
                      ? "Read the check-in"
                      : "What needs doing?"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={question === "routine"}
                    onClick={() => {
                      setQuestion("routine");
                      onReadRequest(item.key);
                    }}
                  >
                    Tell me about your day
                  </button>
                </div>
                <ol className={styles.steps} aria-label="Case progress">
                  <li data-done={entry.met}>
                    <span>1</span>
                    <div>
                      <strong>Hear the request</strong>
                      <small>
                        {entry.met
                          ? "Resident's story recorded"
                          : "Read the request or talk at the home"}
                      </small>
                    </div>
                  </li>
                  <li data-done={entry.inspected}>
                    <span>2</span>
                    <div>
                      <strong>Inspect the home</strong>
                      <small>
                        {entry.inspected
                          ? "Interior visit recorded"
                          : "Step through the front door"}
                      </small>
                    </div>
                  </li>
                  <li data-done={repaired}>
                    <span>3</span>
                    <div>
                      <strong>{item.repairLabel}</strong>
                      <small>
                        {repaired
                          ? "Upgrade installed in the home"
                          : `Find the ${item.location}`}
                      </small>
                    </div>
                  </li>
                  <li data-done={stage === "complete"}>
                    <span>4</span>
                    <div>
                      <strong>Check in with {item.ownerName}</strong>
                      <small>
                        {stage === "complete"
                          ? "Resident feedback recorded"
                          : "Talk at the home after the repair"}
                      </small>
                    </div>
                  </li>
                </ol>
                <div className={styles.nextAction}>
                  <p>
                    {stage === "complete"
                      ? "A small change, part of someone's everyday life. Your notes stay here for another visit."
                      : stage === "meet"
                        ? `Start with ${item.ownerName}'s request, then visit the home.`
                        : stage === "inspect"
                          ? `Go inside ${item.homeName}. Arrival records the inspection; choosing a destination does not.`
                          : stage === "repair"
                            ? `Inside the home, walk to the ${item.location} and use the repair action.`
                            : `The repair is installed. Use Talk to ${item.ownerName} at the home to hear what changed.`}
                  </p>
                  {stage === "meet" ? (
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => {
                        setQuestion("request");
                        onReadRequest(item.key);
                      }}
                    >
                      Read {item.ownerName}'s request
                    </button>
                  ) : (
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => onVisit(item)}
                    >
                      <GameIcon name="home" size={18} />
                      {stage === "complete"
                        ? "Visit again"
                        : stage === "follow-up"
                          ? "Return for a check-in"
                          : `Visit ${item.homeName}`}
                    </button>
                  )}
                  {stage !== "meet" ? (
                    <small className={styles.travelNote}>
                      In town view, the visit opens at the door. While walking,
                      reach the home's front door first.
                    </small>
                  ) : null}
                </div>
                <details className={styles.notes}>
                  <summary>Case notes</summary>
                  <p>
                    <strong>Reported:</strong> {item.request}
                  </p>
                  <p>
                    <strong>Current home:</strong>{" "}
                    {repaired
                      ? "The requested upgrade is installed."
                      : item.evidence}
                  </p>
                  {entry.inspected ? (
                    <p>
                      <strong>Visit:</strong> The home interior has been
                      inspected.
                    </p>
                  ) : null}
                  {stage === "complete" ? (
                    <p>
                      <strong>Check-in:</strong> {item.feedback}
                    </p>
                  ) : null}
                </details>
              </article>
            ) : (
              <p className={styles.empty}>
                Choose a resident to hear their request. Repairs happen in the
                city, and the journal keeps the story.
              </p>
            )}
            {previousCheckIns.length > 0 ? (
              <details className={styles.notes}>
                <summary>
                  Previous check-ins ({previousCheckIns.length})
                </summary>
                <ul className={styles.history}>
                  {previousCheckIns.map((past) => (
                    <li key={past.key}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(past.key);
                          setQuestion("request");
                          setShowHomes(false);
                          panelRef.current
                            ?.querySelector("article")
                            ?.scrollIntoView({ block: "start" });
                        }}
                      >
                        {past.ownerName} · {past.repairLabel}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className={styles.localNote}>
              Written game dialogue · Saved on this device when available
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

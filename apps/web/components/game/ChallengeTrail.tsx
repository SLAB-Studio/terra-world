"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  challengeById,
  challengesForStage,
  CHALLENGE_STAGES,
  completedGoalIds,
  isChallengeGoalComplete,
  isChallengeUnlocked,
  type ChallengeTownState,
  type TerraChallenge,
} from "../../lib/challenges/catalog";
import { GameIcon } from "./GameIcon";
import styles from "./ChallengeTrail.module.css";

type ChallengeHint = Readonly<{
  message: string;
  hints: readonly [string, string, string];
  source: "private-compute" | "authored-server" | "authored-local";
}>;

type ChallengeTrailProps = Readonly<{
  open: boolean;
  activeChallenge: TerraChallenge;
  town: ChallengeTownState;
  moves: number;
  completedIds: readonly string[];
  bestStars: Readonly<Record<string, number>>;
  onClose: () => void;
  onStart: (challengeId: string) => void;
  onHintUsed: () => void;
  onRiverMessage: (message: string) => void;
}>;

export default function ChallengeTrail({
  open,
  activeChallenge,
  town,
  moves,
  completedIds,
  bestStars,
  onClose,
  onStart,
  onHintUsed,
  onRiverMessage,
}: ChallengeTrailProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelectedId] = useState(activeChallenge.id);
  const [hint, setHint] = useState<ChallengeHint | null>(null);
  const [visibleHintCount, setVisibleHintCount] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const selected = challengeById(selectedId) ?? activeChallenge;
  const selectedComplete = completedIds.includes(selected.id);
  const selectedStage = CHALLENGE_STAGES.find(
    (stage) => stage.id === selected.stage,
  );
  const selectedIsActive = selected.id === activeChallenge.id;
  const selectedGoalIds = useMemo(
    () => (selectedIsActive ? completedGoalIds(selected, town) : []),
    [selected, selectedIsActive, town],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedId(activeChallenge.id);
    setHint(null);
    setVisibleHintCount(0);
    closeButtonRef.current?.focus();
  }, [activeChallenge.id, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  async function revealHint() {
    if (!selectedIsActive || visibleHintCount >= 3 || hintLoading) return;
    let nextHint = hint;
    if (nextHint === null) {
      setHintLoading(true);
      nextHint = await requestChallengeHint({
        challenge: selected,
        completedGoalIds: selectedGoalIds,
        moves,
      });
      setHint(nextHint);
      setHintLoading(false);
    }
    const nextCount = Math.min(3, visibleHintCount + 1);
    setVisibleHintCount(nextCount);
    onHintUsed();
    const clue = nextHint.hints[nextCount - 1];
    if (clue !== undefined) onRiverMessage(`Leo’s clue: ${clue}`);
  }

  if (!open) return null;

  return (
    <aside
      aria-label="Terra World adventure trail"
      aria-modal="true"
      className={styles.drawer}
      role="dialog"
    >
      <header className={styles.header}>
        <div className={styles.titleMark} aria-hidden="true">
          <GameIcon name="spark" size={27} />
        </div>
        <div>
          <h2>Adventure Trail</h2>
          <p>Fifteen connected stories unfold across your town.</p>
        </div>
        <button
          aria-label="Close adventure trail"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <GameIcon name="close" size={22} />
        </button>
      </header>

      <nav className={styles.stageRail} aria-label="Challenge stages">
        {CHALLENGE_STAGES.map((stage) => {
          const firstChallenge = challengesForStage(stage.id)[0];
          const unlocked =
            firstChallenge !== undefined &&
            isChallengeUnlocked(firstChallenge.id, completedIds);
          const completeCount = challengesForStage(stage.id).filter(
            (challenge) => completedIds.includes(challenge.id),
          ).length;
          return (
            <button
              aria-current={selected.stage === stage.id ? "step" : undefined}
              className={`${styles.stageButton} ${styles[`stage${stage.colour}`]}`}
              disabled={!unlocked}
              key={stage.id}
              onClick={() => {
                if (firstChallenge !== undefined) {
                  setSelectedId(
                    challengesForStage(stage.id).find((challenge) =>
                      isChallengeUnlocked(challenge.id, completedIds),
                    )?.id ?? firstChallenge.id,
                  );
                  setHint(null);
                  setVisibleHintCount(0);
                }
              }}
              type="button"
            >
              <span>{stage.id}</span>
              <strong>{stage.title}</strong>
              <small>{unlocked ? `${completeCount}/3` : "Locked"}</small>
            </button>
          );
        })}
      </nav>

      <div className={styles.body}>
        <section className={styles.challengeList} aria-label="Stage challenges">
          <div>
            <h3>{selectedStage?.title ?? "Challenges"}</h3>
            <p>{selectedStage?.subtitle}</p>
          </div>
          {challengesForStage(selected.stage).map((challenge) => {
            const unlocked = isChallengeUnlocked(challenge.id, completedIds);
            const complete = completedIds.includes(challenge.id);
            return (
              <button
                aria-pressed={selected.id === challenge.id}
                className={styles.challengeButton}
                disabled={!unlocked}
                key={challenge.id}
                onClick={() => {
                  setSelectedId(challenge.id);
                  setHint(null);
                  setVisibleHintCount(0);
                }}
                type="button"
              >
                <span className={styles.challengeNumber}>
                  {challenge.order}
                </span>
                <span>
                  <strong>{challenge.title}</strong>
                  <small>
                    {complete
                      ? `${bestStars[challenge.id] ?? 1} leaves earned`
                      : unlocked
                        ? challenge.difficulty
                        : "Finish the challenge before this one"}
                  </small>
                </span>
                <span
                  className={complete ? styles.completeMark : styles.arrowMark}
                >
                  {complete ? (
                    <GameIcon name="shield" size={20} />
                  ) : (
                    <GameIcon name="arrow" size={20} />
                  )}
                </span>
              </button>
            );
          })}
        </section>

        <section
          className={styles.challengeDetail}
          aria-labelledby="selected-challenge-title"
        >
          <div className={styles.detailTopline}>
            <span>{selected.difficulty}</span>
            <span>Try in {selected.parMoves} moves</span>
          </div>
          <h3 id="selected-challenge-title">{selected.title}</h3>
          <p className={styles.story}>{selected.story}</p>
          <p className={styles.instruction}>{selected.instruction}</p>

          <ul className={styles.goalList}>
            {selected.goals.map((goal) => {
              const complete =
                selectedIsActive && isChallengeGoalComplete(goal, town);
              return (
                <li
                  className={complete ? styles.goalComplete : ""}
                  key={goal.id}
                >
                  <span aria-hidden="true">
                    {complete ? (
                      <GameIcon name="shield" size={19} />
                    ) : (
                      <GameIcon name="spark" size={19} />
                    )}
                  </span>
                  {goal.label}
                </li>
              );
            })}
          </ul>

          <div className={styles.learningNote}>
            <GameIcon name="nature" size={22} />
            <p>
              <strong>
                {selectedComplete ? "What we discovered" : "What to watch"}
              </strong>
              {selectedComplete
                ? selected.learning
                : "Try a change, run the town, and look for what responds."}
            </p>
          </div>

          {selectedIsActive ? (
            <div className={styles.activeActions}>
              <div className={styles.moveCount}>
                <span>{moves}</span>
                <small>moves</small>
              </div>
              <button
                className={styles.hintButton}
                disabled={visibleHintCount >= 3 || hintLoading}
                onClick={() => void revealHint()}
                type="button"
              >
                <GameIcon name="spark" size={20} />
                {hintLoading
                  ? "Leo is thinking…"
                  : visibleHintCount === 0
                    ? "Ask Leo for a tiny clue"
                    : visibleHintCount < 3
                      ? "Show another clue"
                      : "All clues shown"}
              </button>
            </div>
          ) : (
            <button
              className={styles.startButton}
              onClick={() => onStart(selected.id)}
              type="button"
            >
              {completedIds.includes(selected.id)
                ? "Play again"
                : "Start challenge"}
              <GameIcon name="play" size={20} />
            </button>
          )}

          {hint !== null && visibleHintCount > 0 && (
            <div className={styles.hintPanel} aria-live="polite">
              <strong>{hint.message}</strong>
              <ol>
                {hint.hints.slice(0, visibleHintCount).map((clue) => (
                  <li key={clue}>{clue}</li>
                ))}
              </ol>
              <small>
                {hint.source === "private-compute"
                  ? "Private 0G Compute clue"
                  : "Built-in safe clue"}
              </small>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}

async function requestChallengeHint(input: {
  readonly challenge: TerraChallenge;
  readonly completedGoalIds: readonly string[];
  readonly moves: number;
}): Promise<ChallengeHint> {
  try {
    const response = await fetch("/api/challenges/hint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({
        schemaVersion: 1,
        challengeId: input.challenge.id,
        completedGoalIds: input.completedGoalIds,
        moves: input.moves,
      }),
    });
    if (!response.ok) throw new Error("hint-unavailable");
    const value = (await response.json()) as unknown;
    if (!isChallengeHint(value)) throw new Error("hint-invalid");
    return value;
  } catch {
    return {
      message: "Leo says: let’s look at the town one small step at a time.",
      hints: input.challenge.hints,
      source: "authored-local",
    };
  }
}

function isChallengeHint(value: unknown): value is ChallengeHint {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.message === "string" &&
    record.message.length <= 240 &&
    Array.isArray(record.hints) &&
    record.hints.length === 3 &&
    record.hints.every(
      (hint) =>
        typeof hint === "string" && hint.length > 0 && hint.length <= 180,
    ) &&
    (record.source === "private-compute" ||
      record.source === "authored-server" ||
      record.source === "authored-local")
  );
}

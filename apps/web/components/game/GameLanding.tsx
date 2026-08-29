"use client";

import { useEffect, useRef, useState } from "react";

import type { ChallengeWelcomeProgress } from "../../lib/challenges/welcome-progress";
import { GameIcon } from "./GameIcon";
import styles from "./GameLanding.module.css";

type GameLandingProps = Readonly<{
  errorMessage: string | null;
  hasSavedGame: boolean;
  loading: boolean;
  playerRoleLabel: string;
  progress: ChallengeWelcomeProgress | null;
  onContinue: () => void;
  onStart: () => Promise<void>;
}>;

export default function GameLanding({
  errorMessage,
  hasSavedGame,
  loading,
  playerRoleLabel,
  progress,
  onContinue,
  onStart,
}: GameLandingProps) {
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const startNewButtonRef = useRef<HTMLButtonElement>(null);
  const keepTownButtonRef = useRef<HTMLButtonElement>(null);
  const welcomeName = hasSavedGame ? playerRoleLabel : "City Builder";

  useEffect(() => {
    if (!confirmNewGame) return;
    keepTownButtonRef.current?.focus();
    function cancelOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelNewGame();
    }
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [confirmNewGame]);

  function cancelNewGame() {
    setConfirmNewGame(false);
    window.requestAnimationFrame(() => startNewButtonRef.current?.focus());
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.brandMark} aria-hidden="true">
          <span />
        </div>
        <div>
          <strong>Terra World</strong>
          <span>Build a kinder, greener city</span>
        </div>
      </header>

      <div className={styles.gameFrame}>
        <section className={styles.welcome} aria-labelledby="landing-heading">
          <div className={styles.titleGroup}>
            <h1 id="landing-heading">
              Welcome{hasSavedGame ? " back" : ""}, {welcomeName}!
            </h1>
            <p>
              Help families, care for nature, and discover how every small
              choice changes Rivergate.
            </p>
          </div>

          {hasSavedGame && progress !== null && (
            <section className={styles.saveSummary} aria-label="Saved game">
              <div className={styles.saveIcon} aria-hidden="true">
                <GameIcon name="home" size={30} />
              </div>
              <div>
                <strong>Your town is ready</strong>
                <span>
                  Stage {progress.stage} · {progress.activeTitle}
                </span>
              </div>
              <div className={styles.saveNumbers}>
                <strong>
                  {progress.completedCount}/{progress.totalCount}
                </strong>
                <span>challenges</span>
              </div>
            </section>
          )}

          <div className={styles.actions}>
            {hasSavedGame ? (
              <button
                className={styles.primaryAction}
                disabled={loading}
                onClick={onContinue}
                type="button"
              >
                <span>
                  <strong>Continue Game</strong>
                  <small>Jump back into Rivergate</small>
                </span>
                <GameIcon name="play" size={27} />
              </button>
            ) : (
              <button
                className={styles.primaryAction}
                disabled={loading}
                onClick={() => void onStart()}
                type="button"
              >
                <span>
                  <strong>
                    {loading ? "Getting Rivergate ready…" : "Start Game"}
                  </strong>
                  <small>Your first challenge is waiting</small>
                </span>
                <GameIcon name="play" size={27} />
              </button>
            )}

            {hasSavedGame && !confirmNewGame && (
              <button
                className={styles.secondaryAction}
                disabled={loading}
                onClick={() => setConfirmNewGame(true)}
                ref={startNewButtonRef}
                type="button"
              >
                Start New Game
              </button>
            )}
          </div>

          {hasSavedGame && confirmNewGame && (
            <section className={styles.confirmation} aria-live="polite">
              <p>
                <strong>Start Rivergate again?</strong>
                This replaces the town saved on this device.
              </p>
              <div>
                <button
                  disabled={loading}
                  onClick={() => void onStart()}
                  type="button"
                >
                  {loading ? "Starting…" : "Yes, Start Over"}
                </button>
                <button
                  disabled={loading}
                  onClick={cancelNewGame}
                  ref={keepTownButtonRef}
                  type="button"
                >
                  Keep My Town
                </button>
              </div>
            </section>
          )}

          {errorMessage !== null && (
            <p className={styles.entryError} role="alert">
              {errorMessage}
            </p>
          )}

          <p className={styles.safetyNote}>
            No account or wallet needed. Your town stays on this device.
          </p>
        </section>

        <section className={styles.world} aria-label="A preview of Rivergate">
          <div className={styles.sun} aria-hidden="true" />
          <div
            className={`${styles.cloud} ${styles.cloudOne}`}
            aria-hidden="true"
          />
          <div
            className={`${styles.cloud} ${styles.cloudTwo}`}
            aria-hidden="true"
          />
          <div className={styles.hills} aria-hidden="true" />
          <div className={styles.river} aria-hidden="true">
            <span />
            <span />
          </div>

          <div
            className={`${styles.home} ${styles.homeOne}`}
            aria-hidden="true"
          >
            <span className={styles.roof} />
            <span className={styles.door} />
            <span className={styles.window} />
          </div>
          <div
            className={`${styles.home} ${styles.homeTwo}`}
            aria-hidden="true"
          >
            <span className={styles.roof} />
            <span className={styles.door} />
            <span className={styles.window} />
          </div>
          <div
            className={`${styles.tree} ${styles.treeOne}`}
            aria-hidden="true"
          />
          <div
            className={`${styles.tree} ${styles.treeTwo}`}
            aria-hidden="true"
          />

          <div className={styles.riverGuide} aria-hidden="true">
            <span className={styles.guideEyeOne} />
            <span className={styles.guideEyeTwo} />
            <span className={styles.guideSmile} />
          </div>
          <p className={styles.guideBubble}>
            {hasSavedGame
              ? "I kept your place! Ready to help the town?"
              : "Rivergate needs your ideas. Let’s build!"}
          </p>

          <div className={styles.worldPromise}>
            <GameIcon name="spark" size={24} />
            <p>
              <strong>Build it. Try it. Watch it change.</strong>
              Every challenge teaches something useful about the world.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

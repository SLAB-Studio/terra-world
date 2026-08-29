"use client";

import { useEffect, useRef, useState } from "react";

import type { ChallengeWelcomeProgress } from "../../lib/challenges/welcome-progress";
import { normalisePlayerName, playerDisplayName } from "../../lib/player-name";
import { GameIcon } from "./GameIcon";
import styles from "./GameLanding.module.css";

type GameLandingProps = Readonly<{
  errorMessage: string | null;
  hasSavedGame: boolean;
  loading: boolean;
  playerName: string;
  playerRoleLabel: string;
  progress: ChallengeWelcomeProgress | null;
  soundOn: boolean;
  onContinue: () => void;
  onPlayerNameChange: (name: string) => void;
  onSoundToggle: () => void;
  onStart: () => Promise<void>;
}>;

export default function GameLanding({
  errorMessage,
  hasSavedGame,
  loading,
  playerName,
  playerRoleLabel,
  progress,
  soundOn,
  onContinue,
  onPlayerNameChange,
  onSoundToggle,
  onStart,
}: GameLandingProps) {
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const [nameError, setNameError] = useState(false);
  const startNewButtonRef = useRef<HTMLButtonElement>(null);
  const keepTownButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const safePlayerName = normalisePlayerName(playerName);
  const welcomeName = playerDisplayName(playerName);

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

  function canEnterTown(): boolean {
    if (safePlayerName.length > 0) {
      setNameError(false);
      if (safePlayerName !== playerName) onPlayerNameChange(safePlayerName);
      return true;
    }
    setNameError(true);
    nameInputRef.current?.focus();
    return false;
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.brandLockup}>
          <div className={styles.brandMark} aria-hidden="true">
            <span />
          </div>
          <div>
            <strong>Terra World</strong>
            <span>Build a kinder, greener city</span>
          </div>
        </div>
        <button
          aria-pressed={soundOn}
          className={styles.soundButton}
          onClick={onSoundToggle}
          type="button"
        >
          <GameIcon name="volume" size={20} />
          {soundOn ? "Music on" : "Play music"}
        </button>
      </header>

      <div className={styles.gameFrame}>
        <section className={styles.welcome} aria-labelledby="landing-heading">
          <div className={styles.titleGroup}>
            <h1 id="landing-heading">
              Welcome{hasSavedGame ? " back" : ""}, {welcomeName}!
            </h1>
            <p>
              Rivergate is already busy with families, buses, shops, gardens,
              and wildlife. Explore with Leo and discover how one small choice
              can ripple through the whole town.
            </p>
          </div>

          <label className={styles.nameField} htmlFor="builder-name">
            <span>What should Leo call you?</span>
            <input
              aria-describedby="builder-name-help builder-name-error"
              autoComplete="nickname"
              id="builder-name"
              maxLength={24}
              onChange={(event) => {
                onPlayerNameChange(event.target.value);
                if (event.target.value.trim().length > 0) setNameError(false);
              }}
              placeholder="Your builder nickname"
              ref={nameInputRef}
              value={playerName}
            />
            <small id="builder-name-help">
              Use a nickname. Only this device remembers it.
            </small>
            <small
              className={styles.nameError}
              hidden={!nameError}
              id="builder-name-error"
              role="alert"
            >
              Pick a builder nickname before entering Rivergate.
            </small>
          </label>

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
                onClick={() => {
                  if (canEnterTown()) onContinue();
                }}
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
                onClick={() => {
                  if (canEnterTown()) void onStart();
                }}
                type="button"
              >
                <span>
                  <strong>
                    {loading ? "Getting Rivergate ready…" : "Start Game"}
                  </strong>
                  <small>A busy town and your first mystery are waiting</small>
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
                  onClick={() => {
                    if (canEnterTown()) void onStart();
                  }}
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
            No account or wallet needed. Your nickname and town stay on this
            device.
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
            className={`${styles.home} ${styles.homeThree}`}
            aria-hidden="true"
          >
            <span className={styles.roof} />
            <span className={styles.door} />
            <span className={styles.window} />
          </div>
          <div
            className={`${styles.home} ${styles.homeFour}`}
            aria-hidden="true"
          >
            <span className={styles.roof} />
            <span className={styles.door} />
            <span className={styles.window} />
          </div>
          <div
            className={`${styles.home} ${styles.homeFive}`}
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
              ? `I kept your place, ${welcomeName}! I’m Leo—ready to see what changed?`
              : safePlayerName.length > 0
                ? `Hi ${welcomeName}! I’m Leo. Rivergate is busy, beautiful… and a little mixed-up.`
                : `Choose a nickname, ${playerRoleLabel}. Then explore Rivergate with Leo!`}
          </p>

          <ul className={styles.townActivity} aria-label="Rivergate is active">
            <li>School open</li>
            <li>Market busy</li>
            <li>Buses moving</li>
          </ul>

          <div className={styles.worldPromise}>
            <GameIcon name="spark" size={24} />
            <p>
              <strong>Explore it. Try it. Watch it respond.</strong>
              The 3D town shows what changed before Leo helps explain why.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

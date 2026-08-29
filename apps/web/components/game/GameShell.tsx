"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SafeCityPersonality } from "../../../../packages/safety/src/city-guide";
import {
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
  hashActionLog,
  hashCityState,
} from "@terra/simulation";

import {
  createDeveloperGame,
  createGameSessionSave,
  getChildFeedback,
  getCurrentMission,
  gameReducer,
  restoreGameSession,
  type GameState,
} from "../../lib/game/controller";
import {
  backUpCampaignSession,
  createCheckpointBackupStore,
  createCheckpointHttpRemoteStorage,
  parseAdultBackupKit,
  restoreCampaignSession,
  serializeAdultBackupKit,
  type AdultBackupKit,
  type DurableCheckpointBackupStore,
} from "../../lib/checkpoints";
import {
  createCityGuideController,
  type CityGuideControllerSnapshot,
  type CityGuideProof,
} from "../../lib/guide";
import { CHALLENGE_PROGRESS_STORAGE_KEY } from "../../lib/challenges/catalog";
import {
  readChallengeWelcomeProgress,
  type ChallengeWelcomeProgress,
} from "../../lib/challenges/welcome-progress";
import {
  normalisePlayerName,
  playerDisplayName,
  PLAYER_NAME_STORAGE_KEY,
  readStoredPlayerName,
} from "../../lib/player-name";
import {
  createOfflinePersistence,
  type OfflinePersistence,
} from "../../lib/offline";
import CompoundWorld from "./CompoundWorld";
import GameLanding from "./GameLanding";
import { GameIcon } from "./GameIcon";
import TownSoundscape, { requestTownAudioStart } from "./TownSoundscape";

const RIVERGATE_CITY_ID = "rivergate-city";
const LOCAL_PROFILE_ID = "local-builder";
const ADULT_PIN_STORAGE_KEY = "terra-world-adult-pin-v1";

type PlayerRole = "water-keeper" | "neighbour-helper" | "nature-planner";
type SaveState = "loading" | "saving" | "saved" | "temporary";
type BackupState = "idle" | "backing-up" | "ready" | "restoring" | "error";
type ExpertMessage = Readonly<{
  id: string;
  speaker: "child" | "river";
  text: string;
}>;

const PLAYER_ROLES: readonly {
  id: PlayerRole;
  label: string;
  description: string;
  icon: Parameters<typeof GameIcon>[0]["name"];
}[] = [
  {
    id: "water-keeper",
    label: "Water Keeper",
    description: "Help clean water reach every home.",
    icon: "water",
  },
  {
    id: "neighbour-helper",
    label: "Neighbour Helper",
    description: "Plan a city where everyone can thrive.",
    icon: "home",
  },
  {
    id: "nature-planner",
    label: "Nature Planner",
    description: "Make room for people, wetlands, and wildlife.",
    icon: "nature",
  },
];

export default function GameShell() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createDeveloperGame(),
  );
  const persistenceRef = useRef<OfflinePersistence | null>(null);
  const adultSessionReadyRef = useRef(false);
  const adultEntryRef = useRef<HTMLButtonElement | null>(null);
  const adultDialogRef = useRef<HTMLElement | null>(null);
  const expertEntryRef = useRef<HTMLButtonElement | null>(null);
  const expertCloseRef = useRef<HTMLButtonElement | null>(null);
  const expertDialogRef = useRef<HTMLElement | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const expertMessageSequenceRef = useRef(0);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(false);
  const [welcomeProgress, setWelcomeProgress] =
    useState<ChallengeWelcomeProgress | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerRole, setPlayerRole] = useState<PlayerRole>("water-keeper");
  const [colourTheme, setColourTheme] = useState<
    "sunrise" | "river" | "forest"
  >("river");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [adultPanelOpen, setAdultPanelOpen] = useState(false);
  const [adultUnlocked, setAdultUnlocked] = useState(false);
  const [adultAnswer, setAdultAnswer] = useState("");
  const [adultConfirm, setAdultConfirm] = useState("");
  const [adultPinConfigured, setAdultPinConfigured] = useState(false);
  const [adultGateError, setAdultGateError] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [muted, setMuted] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [backupKit, setBackupKit] = useState<AdultBackupKit | null>(null);
  const [backupKitImported, setBackupKitImported] = useState(false);
  const [backupState, setBackupState] = useState<BackupState>("idle");
  const [backupMessage, setBackupMessage] = useState(
    "Create an encrypted recovery point when an adult is ready.",
  );
  const [expertQuestion, setExpertQuestion] = useState("");
  const [expertDrawerOpen, setExpertDrawerOpen] = useState(false);
  const [expertMessages, setExpertMessages] = useState<
    readonly ExpertMessage[]
  >([
    {
      id: "river-welcome",
      speaker: "river",
      text: "Hi! I’m Leo. Rivergate is already bustling—buses are moving, shops are open, and neighbours are out. Want to explore what one small change can do?",
    },
  ]);
  const lastExpertFeedbackRef = useRef<string | null>(null);
  const lastExpertTurnRef = useRef(state.city.turn);
  const [guideController] = useState(() => createCityGuideController());
  const [guideSnapshot, setGuideSnapshot] = useState(() =>
    guideController.getSnapshot(),
  );
  const previousCommittedStateRef = useRef<GameState>(state);
  const currentMission = useMemo(() => getCurrentMission(state), [state]);
  const childFeedback = useMemo(() => getChildFeedback(state), [state]);
  const displayedFeedback = useMemo(() => {
    const result = guideSnapshot.result;
    if (guideSnapshot.status !== "ready" || result === null || !result.ok) {
      return childFeedback;
    }
    return {
      explanation: result.guide.message,
      question:
        result.guide.reflectiveQuestion ??
        childFeedback?.question ??
        "What did you notice changing in Rivergate?",
      hint:
        result.guide.hints?.[0] ??
        "Use the planning lenses to compare the system you just changed.",
    };
  }, [childFeedback, guideSnapshot]);
  const actionLogHash = useMemo(
    () => hashActionLog(state.city.actionLog),
    [state.city.actionLog],
  );
  const cityStateHash = useMemo(() => hashCityState(state.city), [state.city]);

  useEffect(() => {
    const explanation = displayedFeedback?.explanation;
    if (
      explanation === undefined ||
      state.city.turn === lastExpertTurnRef.current ||
      explanation === lastExpertFeedbackRef.current
    )
      return;
    lastExpertTurnRef.current = state.city.turn;
    lastExpertFeedbackRef.current = explanation;
    setExpertMessages((messages) => {
      if (messages.some((message) => message.text === explanation))
        return messages;
      return [
        ...messages.slice(-5),
        {
          id: `river-change-${state.city.turn}-${messages.length}`,
          speaker: "river",
          text: explanation,
        },
      ];
    });
  }, [displayedFeedback?.explanation, state.city.turn]);

  useEffect(() => {
    return guideController.subscribe(() => {
      setGuideSnapshot(guideController.getSnapshot());
    });
  }, [guideController]);

  useEffect(() => {
    setAdultPinConfigured(readDeviceItem(ADULT_PIN_STORAGE_KEY) !== null);
  }, []);

  useEffect(() => {
    if (!adultPanelOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = adultDialogRef.current;

    function handleDialogKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAdultPanelOpen(false);
        setAdultUnlocked(false);
        setAdultAnswer("");
        setAdultConfirm("");
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      document.body.style.overflow = previousOverflow;
      adultEntryRef.current?.focus();
    };
  }, [adultPanelOpen]);

  useEffect(() => {
    if (!expertDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      expertCloseRef.current?.focus();
    });
    const focusTimer = window.setTimeout(() => {
      expertCloseRef.current?.focus();
    }, 240);

    function handleExpertKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpertDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = expertDialogRef.current;
      if (dialog === null) return;
      const controls = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleExpertKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleExpertKey);
      document.body.style.overflow = previousOverflow;
      expertEntryRef.current?.focus();
    };
  }, [expertDrawerOpen]);

  useEffect(() => {
    return () => guideController.dispose();
  }, [guideController]);

  useEffect(() => {
    const before = previousCommittedStateRef.current;
    previousCommittedStateRef.current = state;
    if (state.city.turn !== before.city.turn + 1) return;

    const action = state.city.actionLog.at(-1);
    const causes = state.turnHistory.at(-1)?.causes;
    const mission = RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters
      .flatMap((chapter) => chapter.missions)
      .find((candidate) => candidate.id === before.campaign.missionId);
    if (action === undefined || causes === undefined || mission === undefined)
      return;

    void guideController.request({
      ageBand: "8-10",
      task: "explain",
      cityPersonality: personalityFor(playerRole),
      mission,
      before: before.city,
      action,
      after: state.city,
      causes,
      allowedFactKeys: mission.learningFactKeys,
      relevantMemories: [],
    });
  }, [guideController, playerRole, state]);

  useEffect(() => {
    let disposed = false;
    void createOfflinePersistence()
      .then(async (persistence) => {
        if (disposed) {
          persistence.close();
          return;
        }
        persistenceRef.current = persistence;
        const [saved, profile, settings] = await Promise.all([
          persistence.getCampaignSession(RIVERGATE_CITY_ID),
          persistence.getProfile(LOCAL_PROFILE_ID),
          persistence.getSettings(LOCAL_PROFILE_ID),
        ]);
        if (profile?.avatarId !== undefined) {
          const role = PLAYER_ROLES.find(
            (candidate) => candidate.id === profile.avatarId,
          );
          if (role !== undefined) setPlayerRole(role.id);
        }
        if (profile?.colourTheme !== undefined)
          setColourTheme(profile.colourTheme);
        if (settings !== null) {
          setTextScale(settings.textScale);
          setHighContrast(settings.highContrast);
          setMuted(settings.muted);
        }
        let campaignRestored = false;
        if (saved !== null) {
          try {
            dispatch({ type: "restore", state: restoreGameSession(saved) });
            campaignRestored = true;
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
        const localChallengeProgress = readChallengeWelcomeProgress(
          readDeviceItem(CHALLENGE_PROGRESS_STORAGE_KEY),
        );
        setPlayerName(
          readStoredPlayerName(readDeviceItem(PLAYER_NAME_STORAGE_KEY)),
        );
        setWelcomeProgress(localChallengeProgress);
        setHasSavedGame(campaignRestored || localChallengeProgress !== null);
        if (!disposed) {
          setSaveState(persistence.kind === "memory" ? "temporary" : "saved");
          setPersistenceReady(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          const localChallengeProgress = readChallengeWelcomeProgress(
            readDeviceItem(CHALLENGE_PROGRESS_STORAGE_KEY),
          );
          setPlayerName(
            readStoredPlayerName(readDeviceItem(PLAYER_NAME_STORAGE_KEY)),
          );
          setWelcomeProgress(localChallengeProgress);
          setHasSavedGame(localChallengeProgress !== null);
          setSaveState("temporary");
          setPersistenceReady(true);
        }
      });
    return () => {
      disposed = true;
      persistenceRef.current?.close();
      persistenceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const persistence = persistenceRef.current;
    if (!persistenceReady || !onboardingComplete || persistence === null)
      return;
    setSaveState(persistence.kind === "memory" ? "temporary" : "saving");
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
      .then(() =>
        setSaveState(persistence.kind === "memory" ? "temporary" : "saved"),
      )
      .catch(() => setSaveState("temporary"));
  }, [onboardingComplete, persistenceReady, state]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--player-text-scale",
      String(textScale),
    );
  }, [textScale]);

  function enterRivergate() {
    const persistence = persistenceRef.current;
    const now = Date.now();
    const safePlayerName = normalisePlayerName(playerName);
    setPlayerName(safePlayerName);
    writeDeviceItem(PLAYER_NAME_STORAGE_KEY, safePlayerName);
    setExpertMessages((messages) =>
      messages.map((message) =>
        message.id === "river-welcome"
          ? {
              ...message,
              text: `Hi ${playerDisplayName(safePlayerName)}! I’m Leo. Rivergate is already busy and full of stories. Want to explore what one small change can do?`,
            }
          : message,
      ),
    );
    if (persistence !== null) {
      void Promise.all([
        persistence.saveProfile({
          profileId: LOCAL_PROFILE_ID,
          avatarId: playerRole,
          colourTheme,
          createdAt: now,
          updatedAt: now,
        }),
        persistence.saveSettings({
          profileId: LOCAL_PROFILE_ID,
          reducedMotion: false,
          highContrast,
          textScale,
          muted,
          locale: "en",
          updatedAt: now,
        }),
      ]).catch(() => setSaveState("temporary"));
    }
    setOnboardingComplete(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function startNewRivergate() {
    if (entryBusy) return;
    setEntryBusy(true);
    setEntryError(null);
    try {
      const persistence = persistenceRef.current;
      if (persistence !== null) {
        await Promise.all([
          persistence.deleteCampaignSession(RIVERGATE_CITY_ID),
          persistence.deleteCity(RIVERGATE_CITY_ID),
        ]);
      }
      const fresh = createDeveloperGame();
      removeDeviceItem(CHALLENGE_PROGRESS_STORAGE_KEY);
      dispatch({ type: "restore", state: fresh });
      setWelcomeProgress(null);
      setHasSavedGame(false);
      enterRivergate();
    } catch {
      setEntryError(
        "Rivergate could not start over yet. Your saved town is still safe—please try again.",
      );
    } finally {
      setEntryBusy(false);
    }
  }

  function continueRivergate() {
    enterRivergate();
  }

  function saveAccessibilitySettings(next: {
    highContrast?: boolean;
    textScale?: number;
    muted?: boolean;
  }) {
    const nextContrast = next.highContrast ?? highContrast;
    const nextTextScale = next.textScale ?? textScale;
    const nextMuted = next.muted ?? muted;
    setHighContrast(nextContrast);
    setTextScale(nextTextScale);
    setMuted(nextMuted);
    void persistenceRef.current
      ?.saveSettings({
        profileId: LOCAL_PROFILE_ID,
        reducedMotion: false,
        highContrast: nextContrast,
        textScale: nextTextScale,
        muted: nextMuted,
        locale: "en",
        updatedAt: Date.now(),
      })
      .catch(() => setSaveState("temporary"));
  }

  async function enableTownSounds() {
    const ready = await requestTownAudioStart();
    if (!ready) {
      setAudioReady(false);
      setEntryError(
        "Music is waiting for another tap. Your game is ready without sound.",
      );
      return;
    }
    setEntryError(null);
    setAudioReady(true);
    saveAccessibilitySettings({ muted: false });
  }

  function toggleTownSounds() {
    if (muted || !audioReady) {
      void enableTownSounds();
      return;
    }
    setAudioReady(false);
    saveAccessibilitySettings({ muted: true });
  }

  function changeAccessibilitySettings(next: {
    highContrast?: boolean;
    textScale?: number;
    muted?: boolean;
  }) {
    if (next.muted === false) {
      void enableTownSounds();
      return;
    }
    if (next.muted === true) setAudioReady(false);
    saveAccessibilitySettings(next);
  }

  async function unlockAdultPanel() {
    const pin = adultAnswer.trim();
    if (!/^\d{4,8}$/u.test(pin)) {
      setAdultGateError(true);
      return;
    }
    if (!adultPinConfigured) {
      if (pin !== adultConfirm.trim()) {
        setAdultGateError(true);
        return;
      }
      if (!writeDeviceItem(ADULT_PIN_STORAGE_KEY, await hashAdultPin(pin))) {
        setAdultGateError(true);
        return;
      }
      setAdultPinConfigured(true);
      setAdultUnlocked(true);
      setAdultGateError(false);
      return;
    }
    const expected = readDeviceItem(ADULT_PIN_STORAGE_KEY);
    if (expected !== null && (await hashAdultPin(pin)) === expected) {
      setAdultUnlocked(true);
      setAdultGateError(false);
      return;
    }
    setAdultGateError(true);
  }

  function closeAdultPanel() {
    setAdultPanelOpen(false);
    setAdultUnlocked(false);
    setAdultAnswer("");
    setAdultConfirm("");
    setAdultGateError(false);
  }

  async function openAdultBackupStore(startSession = true): Promise<{
    store: DurableCheckpointBackupStore;
    remote: ReturnType<typeof createCheckpointHttpRemoteStorage>;
  }> {
    if (startSession && !adultSessionReadyRef.current) {
      const response = await fetch("/api/checkpoints/session", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          operation: "begin-adult-session",
          adultConfirmed: true,
        }),
      });
      if (!response.ok) throw new Error("adult-session-unavailable");
      adultSessionReadyRef.current = true;
    }
    return {
      store: await createCheckpointBackupStore(),
      remote: createCheckpointHttpRemoteStorage(),
    };
  }

  async function backUpRivergate() {
    setBackupState("backing-up");
    setBackupMessage("Encrypting this Rivergate recovery point…");
    let store: DurableCheckpointBackupStore | null = null;
    try {
      const opened = await openAdultBackupStore();
      store = opened.store;
      const kit = await backUpCampaignSession({
        session: createGameSessionSave(state),
        store,
        remote: opened.remote,
      });
      setBackupKit(kit);
      setBackupKitImported(false);
      setBackupState("ready");
      setBackupMessage(
        "Encrypted recovery point ready. Keep the recovery code private.",
      );
    } catch {
      setBackupState("error");
      setBackupMessage(
        "The network backup is waiting. Rivergate is still safe on this device.",
      );
    } finally {
      store?.close();
    }
  }

  async function restoreRivergateFromBackup() {
    if (backupKit === null) return;
    setBackupState("restoring");
    setBackupMessage("Checking and restoring the encrypted recovery point…");
    let store: DurableCheckpointBackupStore | null = null;
    try {
      const opened = await openAdultBackupStore(!backupKitImported);
      store = opened.store;
      const session = await restoreCampaignSession({
        kit: backupKit,
        store,
        remote: opened.remote,
      });
      dispatch({ type: "restore", state: restoreGameSession(session) });
      setBackupState("ready");
      setBackupMessage(
        "Rivergate was restored from the encrypted recovery point.",
      );
    } catch {
      setBackupState("error");
      setBackupMessage(
        "That recovery point could not be restored. The local city was not changed.",
      );
    } finally {
      store?.close();
    }
  }

  function importRecoveryPack(value: string) {
    try {
      const kit = parseAdultBackupKit(value.trim());
      setBackupKit(kit);
      setBackupKitImported(true);
      setBackupState("ready");
      setBackupMessage(
        "Recovery pack loaded. Restore checks its encrypted city before changing anything.",
      );
    } catch {
      setBackupState("error");
      setBackupMessage(
        "That recovery pack is not valid. The local city was not changed.",
      );
    }
  }

  async function resetRivergate() {
    const fresh = createDeveloperGame();
    dispatch({ type: "restore", state: fresh });
    await Promise.all([
      persistenceRef.current?.deleteCampaignSession(RIVERGATE_CITY_ID),
      persistenceRef.current?.deleteCity(RIVERGATE_CITY_ID),
    ]);
    removeDeviceItem(CHALLENGE_PROGRESS_STORAGE_KEY);
    setWelcomeProgress(null);
    setHasSavedGame(false);
    setOnboardingComplete(false);
    setAdultPanelOpen(false);
    setAdultUnlocked(false);
    setAdultAnswer("");
  }

  function askRiver(suggestedQuestion?: string) {
    const question = (suggestedQuestion ?? expertQuestion).trim();
    if (question.length === 0) return;
    const messageId = `${state.city.turn}-${Date.now()}`;
    setExpertMessages((messages) => [
      ...messages.slice(-6),
      { id: `child-${messageId}`, speaker: "child", text: question },
      {
        id: `river-${messageId}`,
        speaker: "river",
        text: expertReplyFor(
          question,
          state,
          currentMission,
          displayedFeedback,
        ),
      },
    ]);
    setExpertQuestion("");
  }

  function shareBuilderLearning(message: string) {
    expertMessageSequenceRef.current += 1;
    setExpertMessages((messages) => [
      ...messages.slice(-5),
      {
        id: `leo-builder-${Date.now()}-${expertMessageSequenceRef.current}`,
        speaker: "river",
        text: message,
      },
    ]);
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

  if (!onboardingComplete) {
    return (
      <>
        <TownSoundscape
          mode="welcome"
          muted={muted}
          onReadyChange={setAudioReady}
        />
        <GameLanding
          errorMessage={entryError}
          hasSavedGame={hasSavedGame}
          loading={entryBusy}
          onContinue={continueRivergate}
          onPlayerNameChange={setPlayerName}
          onSoundToggle={toggleTownSounds}
          onStart={startNewRivergate}
          playerName={playerName}
          playerRoleLabel={
            PLAYER_ROLES.find((role) => role.id === playerRole)?.label ??
            "City Builder"
          }
          progress={welcomeProgress}
          soundOn={!muted && audioReady}
        />
      </>
    );
  }

  return (
    <>
      <TownSoundscape mode="town" muted={muted} onReadyChange={setAudioReady} />
      <main
        className={`game-shell theme-${colourTheme}${highContrast ? " high-contrast" : ""}`}
      >
        <header
          aria-hidden={adultPanelOpen || expertDrawerOpen || undefined}
          className="game-header"
          inert={adultPanelOpen || expertDrawerOpen || undefined}
        >
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <div>
              <strong>Terra World</strong>
              <span>{playerDisplayName(playerName)}’s Rivergate</span>
            </div>
          </div>
          <div className="game-header-controls">
            <button
              aria-label={
                !muted && audioReady
                  ? "Mute town sounds"
                  : "Turn town sounds on"
              }
              aria-pressed={!muted && audioReady}
              className="town-sound-entry"
              onClick={toggleTownSounds}
              type="button"
            >
              <GameIcon name="volume" size={19} />
              {!muted && audioReady ? "Sounds on" : "Sounds off"}
            </button>
            <button
              className="adult-entry"
              onClick={() => setAdultPanelOpen(true)}
              ref={adultEntryRef}
              type="button"
            >
              <GameIcon name="shield" size={19} />
              Grown-ups
            </button>
          </div>
        </header>

        <button
          aria-controls="river-expert-panel"
          aria-expanded={expertDrawerOpen}
          aria-hidden={expertDrawerOpen || undefined}
          className="mobile-expert-jump"
          inert={expertDrawerOpen || undefined}
          onClick={() => setExpertDrawerOpen(true)}
          ref={expertEntryRef}
          type="button"
        >
          <GameIcon name="spark" size={19} />
          Ask Leo
        </button>

        <section
          aria-hidden={adultPanelOpen || undefined}
          className="kid-workspace"
          inert={adultPanelOpen || undefined}
          aria-label="Terra World neighborhood"
        >
          <CompoundWorld
            backgroundInert={expertDrawerOpen}
            onRiverMessage={shareBuilderLearning}
          />

          <aside
            aria-modal={expertDrawerOpen || undefined}
            className={`planning-panel${expertDrawerOpen ? " expert-drawer-open" : ""}`}
            aria-label="Leo, your Rivergate companion"
            ref={expertDialogRef}
            role={expertDrawerOpen ? "dialog" : undefined}
          >
            <section
              className="expert-panel"
              id="river-expert-panel"
              aria-labelledby="expert-heading"
            >
              {expertDrawerOpen && (
                <button
                  aria-label="Close Leo companion"
                  autoFocus
                  className="expert-drawer-close"
                  onClick={() => setExpertDrawerOpen(false)}
                  ref={expertCloseRef}
                  type="button"
                >
                  <GameIcon name="close" size={18} />
                  Close
                </button>
              )}
              <header className="expert-hero">
                <div className="expert-face" aria-hidden="true">
                  <span className="expert-eye expert-eye-left" />
                  <span className="expert-eye expert-eye-right" />
                  <span className="expert-smile" />
                </div>
                <div>
                  <h2 id="expert-heading">Ask Leo</h2>
                  <p>Exploring with {playerDisplayName(playerName)}</p>
                  <span className="expert-online">Watching the town</span>
                </div>
              </header>
              <div className="expert-chat" aria-live="polite">
                {expertMessages.map((message) => (
                  <p
                    className={`chat-bubble chat-${message.speaker}`}
                    key={message.id}
                  >
                    {message.text}
                  </p>
                ))}
                {guideSnapshot.status === "loading" && (
                  <p className="chat-bubble chat-river chat-thinking">
                    I’m checking what changed…
                  </p>
                )}
              </div>
              <div className="expert-prompts" aria-label="Quick questions">
                <button
                  onClick={() => askRiver("What should I add next?")}
                  type="button"
                >
                  What should I add?
                </button>
                <button
                  onClick={() => askRiver("What did that teach me?")}
                  type="button"
                >
                  What did I learn?
                </button>
              </div>
              <form
                className="expert-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  askRiver();
                }}
              >
                <label className="sr-only" htmlFor="expert-question">
                  Ask Leo a question about your city
                </label>
                <input
                  autoComplete="off"
                  id="expert-question"
                  maxLength={120}
                  onChange={(event) => setExpertQuestion(event.target.value)}
                  placeholder="Ask about your city…"
                  value={expertQuestion}
                />
                <button
                  aria-label="Ask Leo"
                  disabled={expertQuestion.trim().length === 0}
                  type="submit"
                >
                  <GameIcon name="arrow" size={20} />
                </button>
              </form>
              <p className="expert-safety">
                Leo only talks about the town. Your words stay on this device.
              </p>
            </section>
            <div className="river-learning-card">
              <span aria-hidden="true">💡</span>
              <p>
                <strong>Try it and watch.</strong>
                Make a change, watch the 3D town, then tell Leo what you notice.
              </p>
            </div>
          </aside>
        </section>

        {expertDrawerOpen && (
          <button
            aria-label="Close Leo companion"
            className="expert-drawer-backdrop"
            onClick={() => setExpertDrawerOpen(false)}
            type="button"
          />
        )}

        {adultPanelOpen && (
          <div
            className="adult-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) closeAdultPanel();
            }}
          >
            <section
              aria-labelledby="adult-dialog-heading"
              aria-modal="true"
              className="adult-dialog"
              ref={adultDialogRef}
              role="dialog"
            >
              <button
                aria-label="Close adult controls"
                className="dialog-close"
                onClick={closeAdultPanel}
                type="button"
              >
                <GameIcon name="close" />
              </button>
              {!adultUnlocked ? (
                <div className="adult-gate">
                  <span className="adult-gate-icon" aria-hidden="true">
                    <GameIcon name="shield" size={34} />
                  </span>
                  <h2 id="adult-dialog-heading">Adult space</h2>
                  <p>
                    Backup, reset, learning notes, and technical proof live here
                    so children can focus on building.
                  </p>
                  <p className="adult-gate-note">
                    {adultPinConfigured
                      ? "Ask the adult who set up this device for the private family code."
                      : "An adult should create a private 4–8 digit family code before continuing."}
                  </p>
                  <label htmlFor="adult-check">
                    {adultPinConfigured ? "Family code" : "Create family code"}
                  </label>
                  <div className="adult-check-row">
                    <input
                      autoFocus
                      autoComplete="off"
                      id="adult-check"
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(event) => setAdultAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && adultPinConfigured)
                          void unlockAdultPanel();
                      }}
                      type="password"
                      value={adultAnswer}
                    />
                    {!adultPinConfigured && (
                      <input
                        aria-label="Confirm family code"
                        autoComplete="off"
                        inputMode="numeric"
                        maxLength={8}
                        onChange={(event) =>
                          setAdultConfirm(event.target.value)
                        }
                        placeholder="Repeat code"
                        type="password"
                        value={adultConfirm}
                      />
                    )}
                    <button
                      onClick={() => void unlockAdultPanel()}
                      type="button"
                    >
                      Continue
                    </button>
                  </div>
                  {adultGateError && (
                    <p className="adult-gate-error" role="alert">
                      {adultPinConfigured
                        ? "That family code did not match. Ask the adult who set it up."
                        : "Use 4–8 digits and enter the same code twice."}
                    </p>
                  )}
                </div>
              ) : (
                <AdultControls
                  actionLogHash={actionLogHash}
                  backupKit={backupKit}
                  backupMessage={backupMessage}
                  backupState={backupState}
                  cityStateHash={cityStateHash}
                  guideProof={guideProofFor(guideSnapshot)}
                  highContrast={highContrast}
                  muted={muted}
                  onAccessibilityChange={changeAccessibilitySettings}
                  onBackup={() => void backUpRivergate()}
                  onImportRecoveryPack={importRecoveryPack}
                  onReset={() => void resetRivergate()}
                  onRestore={() => void restoreRivergateFromBackup()}
                  saveState={saveState}
                  state={state}
                  textScale={textScale}
                  recoveryPack={
                    backupKit === null
                      ? null
                      : serializeAdultBackupKit(backupKit)
                  }
                />
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function expertReplyFor(
  question: string,
  state: GameState,
  mission: ReturnType<typeof getCurrentMission>,
  feedback: ReturnType<typeof getChildFeedback>,
): string {
  const words = question.toLowerCase();
  const nextObjective = mission?.objectives.find(
    (objective) => !objective.completed,
  );

  if (words.includes("water") || words.includes("clean")) {
    return `I checked the town: Rivergate’s clean-water score is ${Math.round(state.city.indicators.water)}. Which home or garden looks different after your last change?`;
  }
  if (
    words.includes("money") ||
    words.includes("budget") ||
    words.includes("cost")
  ) {
    return `You have $${state.city.budget.toLocaleString()} to spend. Build what the mission needs first, then save some money for repairs.`;
  }
  if (words.includes("power") || words.includes("energy")) {
    return `I checked the town: Rivergate’s energy score is ${Math.round(state.city.indicators.energy)}. Which windows or rooftops changed after your last move?`;
  }
  if (
    words.includes("tree") ||
    words.includes("park") ||
    words.includes("nature")
  ) {
    return `I checked the town: Rivergate’s nature score is ${Math.round(state.city.indicators.nature)}. What changed around the plants or animals after your last move?`;
  }
  if (words.includes("why") && feedback !== null) {
    return `${feedback.explanation} ${feedback.question}`;
  }
  if (words.includes("learn") || words.includes("teach")) {
    return feedback === null
      ? "Let’s make one small change first. Then we can watch the town and work out what happened together."
      : `${feedback.explanation} ${feedback.question}`;
  }
  if (
    words.includes("next") ||
    words.includes("help") ||
    words.includes("build")
  ) {
    return nextObjective === undefined
      ? "Your mission goals are ready. Run the town, watch closely, and tell me what changes first."
      : `Look around before you build: what seems different near the next goal? If you want a clue, try this: ${nextObjective.description}`;
  }
  return nextObjective === undefined
    ? "Try running the town, then tell me the first change you notice."
    : `Let’s inspect the town first. What do you notice near this goal: ${nextObjective.description}`;
}

type AdultControlsProps = {
  readonly state: ReturnType<typeof createDeveloperGame>;
  readonly saveState: SaveState;
  readonly backupKit: AdultBackupKit | null;
  readonly backupMessage: string;
  readonly backupState: BackupState;
  readonly recoveryPack: string | null;
  readonly actionLogHash: string;
  readonly cityStateHash: string;
  readonly guideProof: CityGuideProof;
  readonly highContrast: boolean;
  readonly textScale: number;
  readonly muted: boolean;
  readonly onAccessibilityChange: (next: {
    highContrast?: boolean;
    textScale?: number;
    muted?: boolean;
  }) => void;
  readonly onBackup: () => void;
  readonly onImportRecoveryPack: (value: string) => void;
  readonly onReset: () => void;
  readonly onRestore: () => void;
};

function AdultControls({
  actionLogHash,
  backupKit,
  backupMessage,
  backupState,
  cityStateHash,
  guideProof,
  highContrast,
  muted,
  onAccessibilityChange,
  onBackup,
  onImportRecoveryPack,
  onReset,
  onRestore,
  saveState,
  state,
  textScale,
  recoveryPack,
}: AdultControlsProps) {
  const [resetArmed, setResetArmed] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  return (
    <div className="adult-controls">
      <header>
        <h2 id="adult-dialog-heading">Adult controls & judge proof</h2>
        <p>
          Rivergate keeps child play free of wallets and technical prompts. This
          view separates family controls from verifiable project evidence.
        </p>
      </header>

      <section className="adult-section" aria-labelledby="access-heading">
        <h3 id="access-heading">Comfort and access</h3>
        <div className="adult-toggle-list">
          <label>
            <GameIcon name="contrast" />
            <span>
              <strong>High contrast</strong>
              <small>Strengthen text, map edges, and controls.</small>
            </span>
            <input
              checked={highContrast}
              onChange={(event) =>
                onAccessibilityChange({ highContrast: event.target.checked })
              }
              type="checkbox"
            />
          </label>
          <label>
            <GameIcon name="volume" />
            <span>
              <strong>Sound</strong>
              <small>
                Optional music, birds, and town sounds. No clue needs audio.
              </small>
            </span>
            <input
              checked={!muted}
              onChange={(event) =>
                onAccessibilityChange({ muted: !event.target.checked })
              }
              type="checkbox"
            />
          </label>
          <label className="text-scale-control">
            <GameIcon name="text" />
            <span>
              <strong>Text size</strong>
              <small>{Math.round(textScale * 100)}% on this device</small>
            </span>
            <input
              aria-label="Text size"
              max="1.25"
              min="0.9"
              onChange={(event) =>
                onAccessibilityChange({
                  textScale: Number(event.target.value),
                })
              }
              step="0.05"
              type="range"
              value={textScale}
            />
          </label>
        </div>
      </section>

      <section className="adult-section" aria-labelledby="learning-heading">
        <h3 id="learning-heading">Learning snapshot</h3>
        <dl className="learning-snapshot">
          <div>
            <dt>Current chapter</dt>
            <dd>{chapterLabel(state.campaign.chapterId)}</dd>
          </div>
          <div>
            <dt>Missions finished</dt>
            <dd>{state.campaign.completedMissionKeys.length} of 15</dd>
          </div>
          <div>
            <dt>Planning turns</dt>
            <dd>{state.city.turn}</dd>
          </div>
          <div>
            <dt>Local save</dt>
            <dd>{saveState === "temporary" ? "Device session" : "Verified"}</dd>
          </div>
        </dl>
      </section>

      <section className="adult-section" aria-labelledby="backup-heading">
        <h3 id="backup-heading">Encrypted family recovery</h3>
        <p className="backup-message" role="status">
          {backupMessage}
        </p>
        <div className="backup-actions">
          <button
            disabled={
              backupState === "backing-up" || backupState === "restoring"
            }
            onClick={onBackup}
            type="button"
          >
            {backupState === "backing-up"
              ? "Encrypting…"
              : "Create recovery point"}
          </button>
          <button
            disabled={
              backupKit === null ||
              backupState === "backing-up" ||
              backupState === "restoring"
            }
            onClick={onRestore}
            type="button"
          >
            {backupState === "restoring" ? "Restoring…" : "Test restore"}
          </button>
        </div>
        {backupKit !== null && recoveryPack !== null && (
          <details className="recovery-code">
            <summary>Save private recovery pack</summary>
            <p>
              Store this with an adult. Anyone with this pack can open the
              encrypted backup.
            </p>
            <code>{recoveryPack}</code>
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(recoveryPack)
                  .then(() => setRecoveryCopied(true))
                  .catch(() => setRecoveryCopied(false));
              }}
              type="button"
            >
              {recoveryCopied ? "Copied" : "Copy recovery pack"}
            </button>
          </details>
        )}
        <div className="recovery-import">
          <label htmlFor="recovery-pack-input">Restore a saved pack</label>
          <textarea
            id="recovery-pack-input"
            onChange={(event) => setRecoveryInput(event.target.value)}
            placeholder="Paste the adult recovery pack"
            rows={3}
            value={recoveryInput}
          />
          <button
            disabled={recoveryInput.trim().length === 0}
            onClick={() => onImportRecoveryPack(recoveryInput)}
            type="button"
          >
            Check recovery pack
          </button>
        </div>
      </section>

      <section
        className="adult-section proof-section"
        aria-labelledby="proof-heading"
      >
        <h3 id="proof-heading">Judge proof mode</h3>
        <p>
          These values come from the running deterministic game. Network proof
          appears only when adult-sponsored 0G services are configured.
        </p>
        <dl className="proof-list">
          <div>
            <dt>Rivergate package</dt>
            <dd>
              <code>0ca0cf041460eb3c</code>
              <span>Local trust anchor</span>
            </dd>
          </div>
          <div>
            <dt>City state</dt>
            <dd>
              <code>{cityStateHash}</code>
              <span>Replayable</span>
            </dd>
          </div>
          <div>
            <dt>Action history</dt>
            <dd>
              <code>{actionLogHash}</code>
              <span>{state.city.actionLog.length} actions</span>
            </dd>
          </div>
          <div>
            <dt>Private city guide</dt>
            <dd>
              <span>{guideProof.label}</span>
              <span>
                {guideProof.source === "private-compute"
                  ? "Verified private compute"
                  : guideProof.source === "unavailable"
                    ? "Guide route not reached"
                    : guideProof.source === "authored-server"
                      ? "Safety-checked server lesson"
                      : guideProof.source === "verified-cache"
                        ? "Verified cached lesson"
                        : "Safety-checked local lesson"}
              </span>
            </dd>
          </div>
          <div>
            <dt>Encrypted backup</dt>
            <dd>
              <span>
                {backupKit === null
                  ? "Recovery network not checked"
                  : backupKit.reference.root.startsWith("demo:")
                    ? "Local demo recovery verified"
                    : `Recovery root ${backupKit.reference.root.slice(0, 18)}…`}
              </span>
              <span>No child wallet · ciphertext only</span>
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="adult-section danger-section"
        aria-labelledby="reset-heading"
      >
        <h3 id="reset-heading">Start Rivergate again</h3>
        <p>This removes the city saved on this device. It cannot be undone.</p>
        {resetArmed ? (
          <div className="reset-confirm">
            <button onClick={onReset} type="button">
              Yes, reset Rivergate
            </button>
            <button onClick={() => setResetArmed(false)} type="button">
              Keep this city
            </button>
          </div>
        ) : (
          <button
            className="reset-button"
            onClick={() => setResetArmed(true)}
            type="button"
          >
            Reset local city
          </button>
        )}
      </section>
    </div>
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

function readDeviceItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDeviceItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeDeviceItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Restricted storage already behaves like an empty local save.
  }
}

async function hashAdultPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`terra-world-adult-gate:${pin}`),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function personalityFor(role: PlayerRole): SafeCityPersonality {
  if (role === "water-keeper") {
    return {
      voice: "curious",
      pace: "brief",
      traits: ["careful-planner", "resourceful-helper"],
    };
  }
  if (role === "neighbour-helper") {
    return {
      voice: "cheerful",
      pace: "brief",
      traits: ["kind-neighbour", "resilient-thinker"],
    };
  }
  return {
    voice: "hopeful",
    pace: "brief",
    traits: ["nature-friend", "curious-builder"],
  };
}

function guideProofFor(snapshot: CityGuideControllerSnapshot): CityGuideProof {
  if (snapshot.status === "ready" && snapshot.result !== null) {
    return snapshot.result.proof;
  }
  if (snapshot.status === "loading") {
    return {
      route: "/api/guide",
      source: "unavailable",
      serverSource: "none",
      validation: "unavailable",
      network: "not-reached",
      label: "Checking a private guide response…",
    };
  }
  return {
    route: "/api/guide",
    source: "authored-local",
    serverSource: "none",
    validation: "passed",
    network: "not-reached",
    label: "Safety-checked local lesson ready",
  };
}

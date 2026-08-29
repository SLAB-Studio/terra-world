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
import type { SafeCityPersonality } from "../../../../packages/safety/src/city-guide";
import {
  RIVERGATE_EN_MESSAGES,
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
  hashActionLog,
  hashCityState,
} from "@terra/simulation";

import { buildingName } from "../../lib/game/catalogue";
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
  restoreGameSession,
  type GameState,
  type OverlayId,
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
    label: "Water keeper",
    description: "Help clean water reach every home.",
    icon: "water",
  },
  {
    id: "neighbour-helper",
    label: "Neighbour helper",
    description: "Plan a city where everyone can thrive.",
    icon: "home",
  },
  {
    id: "nature-planner",
    label: "Nature planner",
    description: "Make room for people, wetlands, and wildlife.",
    icon: "nature",
  },
];

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
  const adultSessionReadyRef = useRef(false);
  const adultEntryRef = useRef<HTMLButtonElement | null>(null);
  const adultDialogRef = useRef<HTMLElement | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [playerRole, setPlayerRole] = useState<PlayerRole>("water-keeper");
  const [colourTheme, setColourTheme] = useState<
    "sunrise" | "river" | "forest"
  >("river");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [online, setOnline] = useState(true);
  const [adultPanelOpen, setAdultPanelOpen] = useState(false);
  const [adultUnlocked, setAdultUnlocked] = useState(false);
  const [adultAnswer, setAdultAnswer] = useState("");
  const [adultConfirm, setAdultConfirm] = useState("");
  const [adultPinConfigured, setAdultPinConfigured] = useState(false);
  const [adultGateError, setAdultGateError] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [muted, setMuted] = useState(true);
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
      text: "Hi! I’m River, your city expert. Ask me what to build or why your city changed.",
    },
  ]);
  const lastExpertFeedbackRef = useRef<string | null>(null);
  const lastExpertTurnRef = useRef(state.city.turn);
  const [guideController] = useState(() => createCityGuideController());
  const [guideSnapshot, setGuideSnapshot] = useState(() =>
    guideController.getSnapshot(),
  );
  const previousCommittedStateRef = useRef<GameState>(state);
  const planningCity = useMemo(() => getPlanningCity(state), [state]);
  const overlay = useMemo(() => getOverlayView(state), [state]);
  const cursorSummary = useMemo(() => getCursorSummary(state), [state]);
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
        "What did this choice change in Rivergate?",
      hint:
        result.guide.hints?.[0] ??
        "Use the planning lenses to compare the system you just changed.",
    };
  }, [childFeedback, guideSnapshot]);
  const unlockedChapterIds = useMemo(
    () => getUnlockedChapterIds(state),
    [state],
  );
  const selected = BUILDING_CATALOGUE.find(
    (building) => building.id === state.selectedBuildingId,
  );
  const changes = operationCount(state);
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
    setAdultPinConfigured(
      window.localStorage.getItem(ADULT_PIN_STORAGE_KEY) !== null,
    );
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
    function closeExpertOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setExpertDrawerOpen(false);
    }
    document.addEventListener("keydown", closeExpertOnEscape);
    return () => document.removeEventListener("keydown", closeExpertOnEscape);
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
        if (saved !== null) {
          try {
            dispatch({ type: "restore", state: restoreGameSession(saved) });
            setOnboardingComplete(true);
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
        if (!disposed) {
          setSaveState(persistence.kind === "memory" ? "temporary" : "saved");
          setPersistenceReady(true);
        }
      })
      .catch(() => {
        if (!disposed) {
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
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--player-text-scale",
      String(textScale),
    );
  }, [textScale]);

  function beginRivergate() {
    const persistence = persistenceRef.current;
    const now = Date.now();
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
      window.localStorage.setItem(
        ADULT_PIN_STORAGE_KEY,
        await hashAdultPin(pin),
      );
      setAdultPinConfigured(true);
      setAdultUnlocked(true);
      setAdultGateError(false);
      return;
    }
    const expected = window.localStorage.getItem(ADULT_PIN_STORAGE_KEY);
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
    setAdultPanelOpen(false);
    setAdultUnlocked(false);
    setAdultAnswer("");
  }

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
      <main
        className={`welcome-shell theme-${colourTheme}${highContrast ? " high-contrast" : ""}`}
      >
        <section className="welcome-landscape" aria-hidden="true">
          <span className="welcome-sun" />
          <span className="welcome-hill welcome-hill-far" />
          <span className="welcome-hill welcome-hill-near" />
          <span className="welcome-river" />
          <span className="welcome-town welcome-town-one" />
          <span className="welcome-town welcome-town-two" />
          <span className="welcome-town welcome-town-three" />
        </section>
        <section className="welcome-card" aria-labelledby="welcome-heading">
          <div className="welcome-brand">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <strong>Terra World</strong>
          </div>
          <h1 id="welcome-heading">A city is waiting for your ideas.</h1>
          <p className="welcome-lead">
            Grow Rivergate from an empty valley. Bring clean water, power,
            homes, care, and nature together—then watch how every choice changes
            the city.
          </p>

          <fieldset className="role-picker">
            <legend>Choose your planner badge</legend>
            <div>
              {PLAYER_ROLES.map((role) => (
                <label key={role.id}>
                  <input
                    checked={playerRole === role.id}
                    name="planner-role"
                    onChange={() => setPlayerRole(role.id)}
                    type="radio"
                    value={role.id}
                  />
                  <span className="role-icon">
                    <GameIcon name={role.icon} size={26} />
                  </span>
                  <strong>{role.label}</strong>
                  <small>{role.description}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="theme-picker">
            <legend>Pick a city-colour flag</legend>
            <div>
              {(["river", "forest", "sunrise"] as const).map((theme) => (
                <label key={theme}>
                  <input
                    checked={colourTheme === theme}
                    name="colour-theme"
                    onChange={() => setColourTheme(theme)}
                    type="radio"
                    value={theme}
                  />
                  <span className={`theme-flag flag-${theme}`} />
                  {capitalize(theme)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="computer-guide-note">
            <GameIcon name="spark" size={22} />
            <p>
              <strong>Meet Rivergate, your computer guide.</strong>
              It can explain verified city changes, but it never controls your
              city. The game and its local explanations work offline.
            </p>
          </div>

          <button
            className="welcome-start"
            onClick={beginRivergate}
            type="button"
          >
            Start the water mission
            <GameIcon name="arrow" />
          </button>
          <p className="welcome-privacy">
            No account, wallet, real name, public score, or purchase needed.
            Your city starts saved on this device.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`game-shell theme-${colourTheme}${highContrast ? " high-contrast" : ""}`}
    >
      <header
        aria-hidden={adultPanelOpen || undefined}
        className="game-header"
        inert={adultPanelOpen || undefined}
      >
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <div>
            <strong>Terra World</strong>
            <span>Build a happy, healthy city</span>
          </div>
        </div>
        <div className="header-actions">
          <div
            className={`save-chip save-${saveState}${online ? "" : " is-offline"}`}
            role="status"
          >
            <span aria-hidden="true" />
            {online
              ? saveState === "saving"
                ? "Saving…"
                : saveState === "temporary"
                  ? "Playing on this device"
                  : "Saved on this device"
              : "Offline · progress stays here"}
          </div>
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
        <dl className="city-facts" aria-label="Rivergate status">
          <div className="fact-energy">
            <dt>
              <GameIcon name="energy" size={16} /> Energy
            </dt>
            <dd>{Math.round(state.city.indicators.energy)}%</dd>
          </div>
          <div className="fact-water">
            <dt>
              <GameIcon name="water" size={16} /> Clean water
            </dt>
            <dd>{Math.round(state.city.indicators.water)}%</dd>
          </div>
          <div className="fact-budget">
            <dt>Budget</dt>
            <dd>${state.city.budget.toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      <button
        aria-controls="river-expert-panel"
        aria-expanded={expertDrawerOpen}
        className="mobile-expert-jump"
        onClick={() => setExpertDrawerOpen(true)}
        type="button"
      >
        <GameIcon name="spark" size={19} />
        Ask River
      </button>

      <section
        aria-hidden={adultPanelOpen || undefined}
        className="game-workspace"
        inert={adultPanelOpen || undefined}
        aria-label="Rivergate planning workspace"
      >
        <aside className="catalogue-panel" aria-labelledby="catalogue-heading">
          <div className="panel-heading">
            <h1 id="catalogue-heading">Building blocks</h1>
            <p>Pick a block. Then tap the city!</p>
          </div>
          <div className="catalogue-scroll">
            <div className="catalogue-grid">
              {BUILDING_CATALOGUE.filter((item) =>
                isBuildingUnlocked(item, unlockedChapterIds),
              ).map((item) => (
                <CatalogueItem
                  isUnlocked
                  item={item}
                  key={item.id}
                  onSelect={() =>
                    dispatch({ type: "select", buildingId: item.id })
                  }
                  onStartDrag={(event) => beginCatalogueDrag(event, item.id)}
                  selected={state.selectedBuildingId === item.id}
                />
              ))}
            </div>
            <p className="unlock-note">
              <GameIcon name="spark" size={17} />
              New blocks appear as you finish missions.
            </p>
          </div>
        </aside>

        <section className="map-panel" aria-labelledby="map-heading">
          <div className="map-toolbar">
            <div>
              <h2 id="map-heading">Rivergate</h2>
              <p>
                {selected === undefined
                  ? "Choose a building block to start"
                  : `${buildingName(selected.id)} is ready — choose its new home!`}
              </p>
            </div>
            <span className="turn-badge">Day {state.city.turn + 1}</span>
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
          <div className="map-command-bar" aria-label="City controls">
            <button
              className="run-city-button"
              disabled={state.campaign.phase === "completed"}
              onClick={() => dispatch({ type: "commit" })}
              type="button"
            >
              <GameIcon name="play" />
              <span>
                {changes === 0
                  ? "Run the city"
                  : `Try ${changes} change${changes === 1 ? "" : "s"}`}
              </span>
            </button>
            <button
              disabled={
                selected === undefined || selected.allowedRotations.length < 2
              }
              onClick={() => dispatch({ type: "rotate" })}
              type="button"
            >
              <GameIcon name="rotate" />
              <span>Turn block</span>
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
          <div className="map-statusbar">
            <p aria-live="polite" id="map-status">
              <span className="status-dot" aria-hidden="true" />
              {state.status}
            </p>
            <span>${state.city.budget.toLocaleString()} left to spend</span>
          </div>
        </section>

        <aside
          className={`planning-panel${expertDrawerOpen ? " expert-drawer-open" : ""}`}
          aria-label="Planning tools"
        >
          <section
            className="expert-panel"
            id="river-expert-panel"
            aria-labelledby="expert-heading"
          >
            <button
              aria-label="Close River expert"
              className="expert-drawer-close"
              onClick={() => setExpertDrawerOpen(false)}
              type="button"
            >
              <GameIcon name="close" size={18} />
              Close
            </button>
            <header className="expert-hero">
              <div className="expert-face" aria-hidden="true">
                <span className="expert-eye expert-eye-left" />
                <span className="expert-eye expert-eye-right" />
                <span className="expert-smile" />
              </div>
              <div>
                <h2 id="expert-heading">Ask River</h2>
                <p>Your friendly city expert</p>
                <span className="expert-online">Ready to help</span>
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
                onClick={() => askRiver("What should I build next?")}
                type="button"
              >
                What next?
              </button>
              <button
                onClick={() => askRiver("Why did my city change?")}
                type="button"
              >
                Why did it change?
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
                Ask River a question about your city
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
                aria-label="Ask River"
                disabled={expertQuestion.trim().length === 0}
                type="submit"
              >
                <GameIcon name="arrow" size={20} />
              </button>
            </form>
            <p className="expert-safety">
              River only talks about your city. Your words stay on this device.
            </p>
          </section>

          {state.ending !== null ? (
            <EndingCard ending={state.ending} />
          ) : (
            <MissionCard
              feedback={displayedFeedback}
              guideLoading={guideSnapshot.status === "loading"}
              mission={currentMission}
              muted={muted}
              progress={state.campaign.completedMissionKeys.length}
            />
          )}

          <details className="city-clues">
            <summary>
              <GameIcon name="layers" />
              Check city clues
            </summary>
            <section
              className="overlay-section"
              aria-labelledby="overlays-heading"
            >
              <div className="section-heading">
                <div>
                  <h2 id="overlays-heading">Map views</h2>
                  <p>See how each city system is doing.</p>
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
              <h2 id="systems-heading">City health</h2>
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
          </details>
        </aside>
      </section>

      {expertDrawerOpen && (
        <button
          aria-label="Close River expert"
          className="expert-drawer-backdrop"
          onClick={() => setExpertDrawerOpen(false)}
          type="button"
        />
      )}

      {dragGhost !== null && (
        <div
          className="drag-ghost"
          style={{ left: dragGhost.x, top: dragGhost.y }}
        >
          <GameIcon name={iconFor(dragGhost.buildingId)} />
          <span>{buildingName(dragGhost.buildingId)}</span>
        </div>
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
                      onChange={(event) => setAdultConfirm(event.target.value)}
                      placeholder="Repeat code"
                      type="password"
                      value={adultConfirm}
                    />
                  )}
                  <button onClick={() => void unlockAdultPanel()} type="button">
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
                onAccessibilityChange={saveAccessibilitySettings}
                onBackup={() => void backUpRivergate()}
                onImportRecoveryPack={importRecoveryPack}
                onReset={() => void resetRivergate()}
                onRestore={() => void restoreRivergateFromBackup()}
                saveState={saveState}
                state={state}
                textScale={textScale}
                recoveryPack={
                  backupKit === null ? null : serializeAdultBackupKit(backupKit)
                }
              />
            )}
          </section>
        </div>
      )}
    </main>
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
    return `Rivergate’s clean-water score is ${Math.round(state.city.indicators.water)}. ${nextObjective?.description ?? "Try connecting homes to a safe water source."}`;
  }
  if (
    words.includes("money") ||
    words.includes("budget") ||
    words.includes("cost")
  ) {
    return `You have $${state.city.budget.toLocaleString()} to spend. Build what the mission needs first, then save some money for repairs.`;
  }
  if (words.includes("power") || words.includes("energy")) {
    return `Rivergate’s energy score is ${Math.round(state.city.indicators.energy)}. Solar panels make power, and batteries help save it for later.`;
  }
  if (
    words.includes("tree") ||
    words.includes("park") ||
    words.includes("nature")
  ) {
    return `Rivergate’s nature score is ${Math.round(state.city.indicators.nature)}. Parks and wetlands give animals space and help with heat and floods.`;
  }
  if (words.includes("why") && feedback !== null) {
    return `${feedback.explanation} ${feedback.question}`;
  }
  if (
    words.includes("next") ||
    words.includes("help") ||
    words.includes("build")
  ) {
    return nextObjective === undefined
      ? "Great work—your mission goals are ready. Run the city and see what happens!"
      : `Your next goal is: ${nextObjective.description}`;
  }
  return nextObjective === undefined
    ? "Try running the city, then ask me why one of the scores changed."
    : `That’s a smart question. For this mission, start here: ${nextObjective.description}`;
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
  readonly guideLoading: boolean;
  readonly muted: boolean;
  readonly progress: number;
};

function MissionCard({
  feedback,
  guideLoading,
  mission,
  muted,
  progress,
}: MissionCardProps) {
  if (mission === null) return null;
  const activeMission = mission;

  function readRivergateAloud() {
    if (
      muted ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    )
      return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(
      [
        activeMission.title,
        activeMission.briefing,
        feedback?.explanation,
        feedback?.question,
        feedback?.hint,
      ]
        .filter((part): part is string => part !== undefined)
        .join(" "),
    );
    speech.rate = 0.92;
    speech.pitch = 1.04;
    window.speechSynthesis.speak(speech);
  }

  return (
    <section className="mission-section" aria-labelledby="mission-heading">
      <div className="mission-heading-row">
        <div>
          <p className="mission-position">
            {chapterLabel(activeMission.chapterId)} · Mission {progress + 1} of
            15
          </p>
          <h2 id="mission-heading">{activeMission.title}</h2>
        </div>
        <span
          className={
            activeMission.requiredComplete ? "mission-ready" : "mission-next"
          }
        >
          {activeMission.requiredComplete ? "Ready" : "In progress"}
        </span>
      </div>
      <p className="mission-briefing">{activeMission.briefing}</p>
      <p
        className="mission-progress"
        aria-label={`${progress} of 15 missions complete`}
      >
        <strong>{progress}/15</strong> missions complete
      </p>
      <ul className="objective-list" aria-label="Mission objectives">
        {activeMission.objectives.map((objective) => (
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
      {guideLoading && (
        <p className="guide-loading" role="status">
          Rivergate is checking what this city change means…
        </p>
      )}
      {feedback !== null && (
        <div className="mission-feedback" aria-label="Rivergate guide">
          <button
            className="read-aloud"
            disabled={muted}
            onClick={readRivergateAloud}
            title={
              muted
                ? "An adult can turn on sound in the adult controls."
                : "Hear Rivergate read this mission"
            }
            type="button"
          >
            <GameIcon name="volume" size={17} />
            {muted ? "Read-aloud is off" : "Hear Rivergate"}
          </button>
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
              <small>The MVP begins muted; no essential clue uses sound.</small>
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

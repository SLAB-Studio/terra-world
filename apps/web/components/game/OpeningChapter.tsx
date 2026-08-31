"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CHAPTER_CHOICES,
  CHAPTER_EVIDENCE,
  CHAPTER_INTRO,
  CHAPTER_SCENARIO,
  getChapterObjective,
  getChapterOutcome,
  type ChapterDecision,
  type ChapterEvidenceId,
  type ChapterEvent,
  type ChapterState,
} from "../../lib/opening-chapter/story";
import {
  createChapterVoice,
  type ChapterVoice,
} from "../../lib/opening-chapter/voice";
import type {
  ChapterGuideIntent,
  ChapterGuideResponse,
} from "../../lib/opening-chapter/guide";
import {
  chapterGuideFallback,
  chapterGuideRequest,
  chapterGuideSourceLabel,
  fetchChapterGuide,
} from "../../lib/opening-chapter/guide-client";
import { deferChapterWorldFocus } from "../../lib/opening-chapter/focus";
import { GameIcon } from "./GameIcon";
import styles from "./OpeningChapter.module.css";

export type OpeningChapterProps = Readonly<{
  state: ChapterState | null;
  savedState?: ChapterState | null;
  onStart(): void;
  onResume?(): void;
  onEvent(event: ChapterEvent): void;
  onExit(): void;
  /** A navigation request only. Inspecting or speaking is accepted by the world at proximity. */
  onFocusEvidence(id: ChapterEvidenceId): void;
  nearbyEvidence?: ChapterEvidenceId | null;
  onInspectNearby(): void;
  onDialogueActiveChange?(active: boolean): void;
  onLeoReply?(reply: Readonly<{ id: string; text: string }>): void;
  onReturnToWorld?(): void;
  paused?: boolean;
}>;

const EVIDENCE_IDS: readonly ChapterEvidenceId[] = [
  "bridge",
  "maya",
  "malik",
  "nia",
];

/**
 * Rivergate extension: the live city remains the scene. A compact objective and
 * on-request notebook frame an authored, interruptible opening. Existing Barlow,
 * slate and amber controls remain authoritative; no replacement city imagery.
 * The world camera owns the focal arrival. Panels move only to explain opening.
 */
export default function OpeningChapter({
  state,
  savedState = null,
  onStart,
  onResume,
  onEvent,
  onExit,
  onFocusEvidence,
  nearbyEvidence = null,
  onInspectNearby,
  onDialogueActiveChange,
  onLeoReply,
  onReturnToWorld,
  paused = false,
}: OpeningChapterProps) {
  const panelId = useId();
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [activeEvidence, setActiveEvidence] =
    useState<ChapterEvidenceId | null>(null);
  const [dialogueIndex, setDialogueIndex] = useState(0);
  const [outcomeDialogue, setOutcomeDialogue] = useState(false);
  const [pendingDecision, setPendingDecision] =
    useState<ChapterDecision | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [leoPending, setLeoPending] = useState(false);
  const [leoReply, setLeoReply] = useState<ChapterGuideResponse | null>(null);
  const leoRequestRef = useRef<AbortController | null>(null);
  const leoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leoRequestIdRef = useRef(0);
  const onLeoReplyRef = useRef(onLeoReply);
  onLeoReplyRef.current = onLeoReply;
  const currentChapterRef = useRef(state);
  currentChapterRef.current = state;
  const voiceRef = useRef<ChapterVoice | null>(null);
  const priorEvidenceCount = useRef(state?.evidence.length ?? 0);
  const priorOutcomeObserved = useRef(state?.outcomeObserved ?? false);
  const evidenceWasActive = useRef(state !== null);
  const outcomeWasActive = useRef(state !== null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const notebookRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogueCallbackRef = useRef(onDialogueActiveChange);
  dialogueCallbackRef.current = onDialogueActiveChange;

  const intro = state?.phase === "intro";
  const introLine = intro ? CHAPTER_INTRO[state.introIndex] : undefined;
  const evidence = activeEvidence
    ? CHAPTER_EVIDENCE[activeEvidence]
    : undefined;
  const evidenceLine = evidence?.lines[dialogueIndex];
  const outcome = useMemo(
    () => (state ? getChapterOutcome(state) : null),
    [state],
  );
  const outcomeLine = outcomeDialogue
    ? outcome?.lines[dialogueIndex]
    : undefined;
  const line = introLine ?? evidenceLine ?? outcomeLine;
  const allEvidence = EVIDENCE_IDS.every((id) => state?.evidence.includes(id));
  const chosen = CHAPTER_CHOICES.find(
    (choice) => choice.id === pendingDecision,
  );
  const focusedReading =
    intro || activeEvidence !== null || outcomeDialogue || notebookOpen;

  useEffect(() => {
    const voice = createChapterVoice(undefined, () =>
      setVoiceNotice(
        "This device could not read the line. The subtitles remain available.",
      ),
    );
    voiceRef.current = voice;
    setVoiceSupported(voice.supported);
    function onVisibility() {
      if (document.hidden) voice.cancel();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      voice.dispose();
      voiceRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!line || !voiceEnabled || paused || document.hidden) {
      voiceRef.current?.cancel();
      return;
    }
    const result = voiceRef.current?.speak(line);
    if (result === "unavailable")
      setVoiceNotice(
        "No installed English voice is available. Continue with subtitles.",
      );
    return () => voiceRef.current?.cancel();
  }, [line, voiceEnabled, paused]);

  useEffect(() => {
    const evidenceCount = state?.evidence.length ?? 0;
    if (
      evidenceWasActive.current &&
      evidenceCount > priorEvidenceCount.current
    ) {
      const newest = state?.evidence[evidenceCount - 1];
      if (newest) {
        setActiveEvidence(newest);
        setDialogueIndex(0);
        setNotebookOpen(false);
      }
    }
    priorEvidenceCount.current = evidenceCount;
    evidenceWasActive.current = state !== null;
  }, [state?.evidence]);

  useEffect(() => {
    if (
      outcomeWasActive.current &&
      state?.outcomeObserved &&
      !priorOutcomeObserved.current
    ) {
      setOutcomeDialogue(true);
      setDialogueIndex(0);
    }
    priorOutcomeObserved.current = state?.outcomeObserved ?? false;
    outcomeWasActive.current = state !== null;
  }, [state?.outcomeObserved]);

  useEffect(() => {
    dialogueCallbackRef.current?.(focusedReading);
    return () => dialogueCallbackRef.current?.(false);
  }, [focusedReading]);

  useEffect(() => {
    if (notebookOpen) closeRef.current?.focus({ preventScroll: true });
    else if (intro || activeEvidence || outcomeDialogue)
      nextRef.current?.focus({ preventScroll: true });
  }, [notebookOpen, intro, activeEvidence, outcomeDialogue]);

  useEffect(() => {
    setLeoReply(null);
    setLeoPending(false);
    return () => {
      leoRequestIdRef.current += 1;
      leoRequestRef.current?.abort();
      if (leoTimeoutRef.current !== null) clearTimeout(leoTimeoutRef.current);
    };
  }, [state, paused]);

  function cancelLeoRequest() {
    leoRequestIdRef.current += 1;
    leoRequestRef.current?.abort();
    leoRequestRef.current = null;
    if (leoTimeoutRef.current !== null) clearTimeout(leoTimeoutRef.current);
    leoTimeoutRef.current = null;
    setLeoPending(false);
  }

  async function askLeo(intent: ChapterGuideIntent) {
    if (!state || paused) return;
    cancelLeoRequest();
    const requestId = leoRequestIdRef.current;
    const controller = new AbortController();
    leoRequestRef.current = controller;
    setLeoPending(true);
    setLeoReply(null);
    leoTimeoutRef.current = setTimeout(() => controller.abort(), 8_000);
    let reply: ChapterGuideResponse;
    try {
      reply = await fetchChapterGuide(
        chapterGuideRequest(state, intent),
        controller.signal,
      );
    } catch {
      reply = chapterGuideFallback(state, intent);
    }
    if (
      requestId !== leoRequestIdRef.current ||
      currentChapterRef.current !== state
    )
      return;
    if (leoTimeoutRef.current !== null) clearTimeout(leoTimeoutRef.current);
    leoTimeoutRef.current = null;
    leoRequestRef.current = null;
    setLeoPending(false);
    setLeoReply(reply);
    onLeoReplyRef.current?.({
      id: `${panelId}-guide-${requestId}`,
      text: reply.text,
    });
    if (voiceEnabled && !document.hidden) {
      const result = voiceRef.current?.speak({
        speaker: "Leo",
        text: reply.text,
      });
      if (result === "unavailable")
        setVoiceNotice(
          "No installed English voice is available. The briefing is available as text.",
        );
    }
  }

  function closeNotebook() {
    cancelLeoRequest();
    voiceRef.current?.cancel();
    setNotebookOpen(false);
    setPendingDecision(null);
    const target = returnFocusRef.current;
    window.requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
      else notebookRef.current?.focus({ preventScroll: true });
    });
  }

  function openNotebook() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setNotebookOpen(true);
    setActiveEvidence(null);
    setOutcomeDialogue(false);
    voiceRef.current?.cancel();
  }

  function toggleVoice() {
    setVoiceNotice("");
    if (voiceEnabled) {
      voiceRef.current?.disable();
      setVoiceEnabled(false);
    } else {
      const enabled = voiceRef.current?.enable() ?? false;
      setVoiceEnabled(enabled);
      if (!enabled)
        setVoiceNotice(
          "Device narration is unavailable. Continue with subtitles.",
        );
    }
  }

  function navigate(id: ChapterEvidenceId) {
    cancelLeoRequest();
    // The world owns focus after travel; don't restore focus onto this overlay.
    setNotebookOpen(false);
    setPendingDecision(null);
    setActiveEvidence(null);
    voiceRef.current?.cancel();
    onFocusEvidence(id);
  }

  function exit() {
    cancelLeoRequest();
    voiceRef.current?.cancel();
    setNotebookOpen(false);
    setActiveEvidence(null);
    setOutcomeDialogue(false);
    onExit();
    deferChapterWorldFocus(onReturnToWorld);
  }

  function closeDialogue() {
    setActiveEvidence(null);
    setOutcomeDialogue(false);
    voiceRef.current?.cancel();
    deferChapterWorldFocus(onReturnToWorld);
  }

  function finishChapter() {
    onEvent({ type: "finish" });
    deferChapterWorldFocus(onReturnToWorld);
  }

  const voiceControl = (
    <button
      type="button"
      className={styles.quietButton}
      aria-pressed={voiceEnabled}
      onClick={toggleVoice}
      disabled={!voiceSupported}
      title="Optional installed device voice; authored dialogue is always subtitled."
    >
      <GameIcon name="volume" size={17} />
      {voiceEnabled ? "Voice on" : "Voice off"}
    </button>
  );

  return (
    <div
      className={styles.root}
      data-opening-phase={state?.phase ?? "entry"}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key !== "Escape") return;
        if (notebookOpen) {
          event.preventDefault();
          closeNotebook();
        } else if (activeEvidence) {
          event.preventDefault();
          closeDialogue();
        } else if (outcomeDialogue) {
          event.preventDefault();
          closeDialogue();
        }
      }}
    >
      {!state ? (
        <section
          className={styles.entry}
          aria-labelledby={`${panelId}-entry-title`}
        >
          <h2 id={`${panelId}-entry-title`}>{CHAPTER_SCENARIO.title}</h2>
          <p>
            One crossing closed. A city still moving. Walk with Leo, hear what
            the residents need, and decide what happens next.
          </p>
          <div className={styles.actions}>
            {savedState && onResume ? (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={onResume}
              >
                {savedState.phase === "complete"
                  ? "View completed chapter"
                  : "Continue opening chapter"}
                <GameIcon name="arrow" size={18} />
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={onStart}
              >
                Begin opening chapter <GameIcon name="arrow" size={18} />
              </button>
            )}
            <button className={styles.quietButton} type="button" onClick={exit}>
              Explore freely
            </button>
          </div>
          <p className={styles.smallPrint}>
            A self-contained, authored chapter. Progress stays on this device.
          </p>
        </section>
      ) : intro ? (
        <>
          <div className={styles.introTop}>
            <span>{CHAPTER_SCENARIO.title}</span>
            <button
              className={styles.quietButton}
              type="button"
              onClick={() => {
                voiceRef.current?.cancel();
                onEvent({ type: "skip-intro" });
              }}
            >
              Skip introduction
            </button>
          </div>
          {line ? (
            <section className={styles.subtitle} aria-label="Opening dialogue">
              <div className={styles.speaker}>
                <strong>{line.speaker === "Leo" ? "LEO" : line.speaker}</strong>
                {line.speaker === "Leo" ? (
                  <span>Your canine companion</span>
                ) : null}
              </div>
              <p key={introLine?.id} aria-live="polite" aria-atomic="true">
                {line.text}
              </p>
              <div className={styles.dialogueFooter}>
                {voiceControl}
                <span className={styles.stepCount}>
                  {state.introIndex + 1} / {CHAPTER_INTRO.length}
                </span>
                <button
                  ref={nextRef}
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => {
                    voiceRef.current?.cancel();
                    onEvent({ type: "advance-intro" });
                  }}
                >
                  {state.introIndex === CHAPTER_INTRO.length - 1
                    ? "Enter Rivergate"
                    : "Continue"}
                  <GameIcon name="arrow" size={17} />
                </button>
              </div>
              <p className={styles.voiceNote}>
                {voiceNotice || "Authored dialogue · optional device narration"}
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <>
          {!notebookOpen ? (
            <section
              className={styles.objective}
              aria-label="Opening chapter objective"
            >
              <div>
                <strong>
                  {state.phase === "complete"
                    ? "Chapter complete"
                    : CHAPTER_SCENARIO.title}
                </strong>
                <p aria-live="polite">{getChapterObjective(state)}</p>
              </div>
              <button
                ref={notebookRef}
                className={styles.quietButton}
                type="button"
                aria-controls={panelId}
                aria-expanded={notebookOpen}
                onClick={openNotebook}
              >
                <GameIcon name="layers" size={17} />
                Notebook
                {state.phase === "investigate"
                  ? ` ${state.evidence.length}/4`
                  : ""}
              </button>
            </section>
          ) : null}

          {!notebookOpen &&
          !activeEvidence &&
          !outcomeDialogue &&
          !outcome &&
          state.phase !== "complete" ? (
            <div className={styles.fieldAction}>
              {state.phase === "decision" ? (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={openNotebook}
                >
                  Review the three responses <GameIcon name="arrow" size={17} />
                </button>
              ) : state.phase === "aftermath" ? (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={
                    nearbyEvidence === "bridge"
                      ? () => onEvent({ type: "observe" })
                      : () => navigate("bridge")
                  }
                >
                  {nearbyEvidence === "bridge"
                    ? "Advance chapter time & inspect"
                    : "Travel to the bridge"}
                  <GameIcon name="arrow" size={17} />
                </button>
              ) : nearbyEvidence &&
                !state.evidence.includes(nearbyEvidence) &&
                (nearbyEvidence === "bridge" ||
                  state.evidence.includes("bridge")) ? (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={onInspectNearby}
                >
                  {nearbyEvidence === "bridge"
                    ? "Inspect the bridge"
                    : `Speak with ${CHAPTER_EVIDENCE[nearbyEvidence].speaker}`}
                  <GameIcon name="arrow" size={17} />
                </button>
              ) : (
                <p className={styles.leoPrompt}>
                  <strong>LEO</strong>{" "}
                  {state.evidence.length === 0
                    ? "Let’s get a closer look at that crossing."
                    : "There’s another side to this. Let’s hear it."}
                </p>
              )}
            </div>
          ) : null}

          {outcomeDialogue && outcomeLine && outcome && !notebookOpen ? (
            <section className={styles.subtitle} aria-label="Residents respond">
              <div className={styles.speaker}>
                <strong>
                  {outcomeLine.speaker === "Leo" ? "LEO" : outcomeLine.speaker}
                </strong>
                <span>
                  {outcomeLine.speaker === "Leo"
                    ? "Your canine companion"
                    : outcomeLine.kind}
                </span>
              </div>
              <p aria-live="polite" aria-atomic="true">
                {outcomeLine.text}
              </p>
              <div className={styles.dialogueFooter}>
                {voiceControl}
                <span className={styles.stepCount}>
                  {dialogueIndex + 1} / {outcome.lines.length}
                </span>
                <button
                  ref={nextRef}
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => {
                    voiceRef.current?.cancel();
                    if (dialogueIndex < outcome.lines.length - 1)
                      setDialogueIndex((index) => index + 1);
                    else closeDialogue();
                  }}
                >
                  {dialogueIndex < outcome.lines.length - 1
                    ? "Continue"
                    : "Review what changed"}
                  <GameIcon name="arrow" size={17} />
                </button>
              </div>
              <p className={styles.voiceNote}>
                {voiceNotice ||
                  "Authored reactions to your recorded decision. Escape skips to the result."}
              </p>
            </section>
          ) : null}

          {activeEvidence && evidenceLine && !notebookOpen ? (
            <section
              className={styles.subtitle}
              aria-label={`${evidence?.title} dialogue`}
            >
              <div className={styles.speaker}>
                <strong>
                  {evidenceLine.speaker === "Leo"
                    ? "LEO"
                    : evidenceLine.speaker}
                </strong>
                <span>
                  {evidenceLine.speaker === "Leo"
                    ? "Your canine companion"
                    : evidenceLine.kind}
                </span>
              </div>
              <p aria-live="polite" aria-atomic="true">
                {evidenceLine.text}
              </p>
              <div className={styles.dialogueFooter}>
                {voiceControl}
                <span className={styles.stepCount}>
                  {dialogueIndex + 1} / {evidence?.lines.length}
                </span>
                <button
                  ref={nextRef}
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => {
                    voiceRef.current?.cancel();
                    if (evidence && dialogueIndex < evidence.lines.length - 1)
                      setDialogueIndex((index) => index + 1);
                    else closeDialogue();
                  }}
                >
                  {evidence && dialogueIndex < evidence.lines.length - 1
                    ? "Continue"
                    : "Back to the city"}
                  <GameIcon name="arrow" size={17} />
                </button>
              </div>
              <p className={styles.voiceNote}>
                {voiceNotice ||
                  "Recorded in your notebook. Escape closes this conversation."}
              </p>
            </section>
          ) : null}

          {state.phase === "complete" && !notebookOpen ? (
            <div className={styles.fieldAction}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={exit}
              >
                Keep exploring Rivergate
                <GameIcon name="arrow" size={17} />
              </button>
            </div>
          ) : null}

          {state.phase === "aftermath" &&
          outcome &&
          !notebookOpen &&
          !outcomeDialogue ? (
            <section
              className={styles.result}
              aria-labelledby={`${panelId}-result-title`}
            >
              <h2 id={`${panelId}-result-title`}>{outcome.title}</h2>
              <p>{outcome.text}</p>
              <p className={styles.muted}>{outcome.unresolved}</p>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={finishChapter}
              >
                Close the opening chapter
                <GameIcon name="arrow" size={17} />
              </button>
            </section>
          ) : null}

          {notebookOpen ? (
            <section
              id={panelId}
              className={styles.notebook}
              role="dialog"
              aria-modal="false"
              aria-labelledby={`${panelId}-title`}
            >
              <header className={styles.notebookHeader}>
                <h2 id={`${panelId}-title`}>Field notebook</h2>
                <button
                  ref={closeRef}
                  className={styles.iconButton}
                  type="button"
                  onClick={closeNotebook}
                  aria-label="Close field notebook"
                >
                  <GameIcon name="close" size={20} />
                </button>
              </header>
              <div className={styles.notebookScroll}>
                <p className={styles.notebookObjective}>
                  {getChapterObjective(state)}
                </p>
                <div className={styles.budget}>
                  <span>Available budget</span>
                  <strong>
                    {state.budget.toLocaleString("en-US")} civic credits
                  </strong>
                  <span>Chapter time</span>
                  <strong>
                    {state.elapsedDays}{" "}
                    {state.elapsedDays === 1 ? "day" : "days"}
                  </strong>
                </div>
                <p className={styles.smallPrint}>
                  {CHAPTER_SCENARIO.currencyDisclosure}
                </p>
                <section
                  className={styles.leoBriefing}
                  aria-labelledby={`${panelId}-leo-title`}
                >
                  <h3 id={`${panelId}-leo-title`}>Ask Leo</h3>
                  <p
                    className={styles.smallPrint}
                    id={`${panelId}-leo-disclosure`}
                  >
                    Ask Leo sends only these chapter events to 0G; no name or
                    chat. Gameplay continues if unavailable. Closing the
                    notebook stops waiting; a request already sent may still
                    finish.
                  </p>
                  <div
                    className={styles.leoActions}
                    aria-describedby={`${panelId}-leo-disclosure`}
                  >
                    <button
                      type="button"
                      className={styles.quietButton}
                      aria-describedby={`${panelId}-leo-disclosure`}
                      disabled={leoPending || paused}
                      onClick={() => void askLeo("next-step")}
                    >
                      Ask Leo what’s next
                    </button>
                    {allEvidence && !state.decision ? (
                      <button
                        type="button"
                        className={styles.textButton}
                        aria-describedby={`${panelId}-leo-disclosure`}
                        disabled={leoPending || paused}
                        onClick={() => void askLeo("tradeoffs")}
                      >
                        Ask about the trade-offs
                      </button>
                    ) : null}
                    {leoPending ? (
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={cancelLeoRequest}
                      >
                        Stop waiting
                      </button>
                    ) : null}
                  </div>
                  <div
                    aria-live="polite"
                    aria-atomic="true"
                    aria-busy={leoPending}
                  >
                    {leoPending ? (
                      <p className={styles.leoStatus}>
                        Leo is checking the chapter record…
                      </p>
                    ) : null}
                    {leoReply ? (
                      <div className={styles.leoReply}>
                        <div className={styles.speaker}>
                          <strong>LEO</strong>
                          <span>Your canine companion</span>
                        </div>
                        <p>{leoReply.text}</p>
                        <p className={styles.leoSource}>
                          {chapterGuideSourceLabel(leoReply.source)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <p className={styles.smallPrint}>
                    0G selects from chapter-grounded sentences, not free-form
                    conversation. Device narration is separate.
                  </p>
                </section>
                {state.phase === "decision" && allEvidence ? (
                  <section
                    className={styles.decision}
                    aria-labelledby={`${panelId}-decision-title`}
                  >
                    <h3 id={`${panelId}-decision-title`}>
                      What should Rivergate do?
                    </h3>
                    <p>
                      No option meets every need. Choose a response to inspect
                      its cost, then commit it.
                    </p>
                    <div role="group" aria-label="Bridge responses">
                      {CHAPTER_CHOICES.map((choice) => (
                        <button
                          key={choice.id}
                          className={styles.choice}
                          type="button"
                          aria-pressed={pendingDecision === choice.id}
                          onClick={() => setPendingDecision(choice.id)}
                        >
                          <strong>{choice.title}</strong>
                          <span>{choice.description}</span>
                          <small>
                            {choice.cost.toLocaleString("en-US")} credits ·{" "}
                            {choice.durationDays}{" "}
                            {choice.durationDays === 1 ? "day" : "days"}
                          </small>
                        </button>
                      ))}
                    </div>
                    {chosen ? (
                      <div className={styles.confirm}>
                        <p>
                          <strong>The compromise:</strong> {chosen.tradeoff}
                        </p>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={chosen.cost > state.budget}
                          onClick={() => {
                            onEvent({ type: "choose", decision: chosen.id });
                            closeNotebook();
                          }}
                        >
                          Commit: {chosen.title}
                        </button>
                        <p className={styles.smallPrint}>
                          This records the decision. Return to the bridge to
                          advance {chosen.durationDays} chapter{" "}
                          {chosen.durationDays === 1 ? "day" : "days"} and
                          inspect the result. Nothing runs while you are away.
                        </p>
                      </div>
                    ) : null}
                  </section>
                ) : null}
                <section
                  className={styles.evidenceList}
                  aria-labelledby={`${panelId}-evidence-title`}
                >
                  <h3 id={`${panelId}-evidence-title`}>At the crossing</h3>
                  <p className={styles.travelNote}>
                    Explore on foot or travel between chapter locations.
                    Speaking and inspection happen when you arrive.
                  </p>
                  {EVIDENCE_IDS.map((id) => {
                    const item = CHAPTER_EVIDENCE[id];
                    const recorded = state.evidence.includes(id);
                    return (
                      <article key={id}>
                        <div className={styles.evidenceHeading}>
                          <h4>{item.title}</h4>
                          <span>
                            {recorded ? "Recorded" : "Not yet visited"}
                          </span>
                        </div>
                        {recorded ? (
                          <p>{item.text}</p>
                        ) : (
                          <p>
                            Visit in the city to{" "}
                            {id === "bridge"
                              ? "inspect the closure"
                              : `hear ${item.speaker}’s perspective`}
                            .
                          </p>
                        )}
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={() => navigate(id)}
                        >
                          {id === "bridge"
                            ? "Travel to the bridge"
                            : `Travel to ${item.speaker}`}
                          <GameIcon name="arrow" size={16} />
                        </button>
                      </article>
                    );
                  })}
                </section>
                {outcome ? (
                  <section className={styles.journal}>
                    <h3>{outcome.title}</h3>
                    <p>{outcome.text}</p>
                    <p>{outcome.unresolved}</p>
                    {state.phase === "aftermath" ? (
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => {
                          onEvent({ type: "finish" });
                          closeNotebook();
                        }}
                      >
                        Close the opening chapter
                      </button>
                    ) : null}
                  </section>
                ) : null}
                <details className={styles.journal}>
                  <summary>
                    Chapter record · {state.journal.length} entries
                  </summary>
                  {state.journal.map((entry) => (
                    <article key={entry.id}>
                      <h4>{entry.title}</h4>
                      <small>Day {entry.day}</small>
                      <p>{entry.text}</p>
                    </article>
                  ))}
                </details>
                <details className={styles.journal}>
                  <summary>Opening dialogue</summary>
                  {CHAPTER_INTRO.map((entry) => (
                    <article key={entry.id}>
                      <h4>
                        {entry.speaker === "Leo"
                          ? "LEO · your canine companion"
                          : entry.speaker}
                      </h4>
                      <p>{entry.text}</p>
                    </article>
                  ))}
                </details>
                <div className={styles.notebookFooter}>
                  {voiceControl}
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={exit}
                  >
                    Return to free exploration
                  </button>
                  <p className={styles.smallPrint}>
                    {voiceNotice ||
                      "Authored story and installed device voices. No microphone or remote voice service."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

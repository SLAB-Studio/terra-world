/** Optional authored-dialogue narration. Nothing is sent to a remote voice service. */
export interface ChapterVoiceHost {
  synthesis: Pick<SpeechSynthesis, "getVoices" | "speak" | "cancel">;
  makeUtterance(text: string): SpeechSynthesisUtterance;
}

export interface ChapterVoiceLine {
  speaker: string;
  text: string;
}

export type ChapterVoiceResult = "spoken" | "disabled" | "unavailable";

/** Only use installed voices; browser-provided cloud voices are deliberately excluded. */
export function selectChapterVoice(
  voices: readonly SpeechSynthesisVoice[],
  speaker: string,
): SpeechSynthesisVoice | undefined {
  const localEnglish = voices.filter(
    (voice) => voice.localService && /^en(?:[-_]|$)/i.test(voice.lang),
  );
  const preferred =
    speaker === "Leo"
      ? /Samantha|Victoria|Zira|Moira|Karen|Tessa/i
      : speaker === "Malik" || speaker === "Sam"
        ? /Daniel|Alex|David|James/i
        : /Samantha|Moira|Karen|Tessa/i;
  return (
    localEnglish.find((voice) => preferred.test(voice.name)) ?? localEnglish[0]
  );
}

function browserVoiceHost(): ChapterVoiceHost | null {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  )
    return null;
  return {
    synthesis: window.speechSynthesis,
    makeUtterance: (text) => new SpeechSynthesisUtterance(text),
  };
}

/** Call enable only from an explicit user gesture. Every new line replaces the old one. */
export function createChapterVoice(
  host: ChapterVoiceHost | null = browserVoiceHost(),
  onUnavailable: () => void = () => undefined,
) {
  let enabled = false;
  let disposed = false;
  let generation = 0;
  let active: SpeechSynthesisUtterance | null = null;

  function cancel() {
    generation += 1;
    if (active) {
      active.onend = null;
      active.onerror = null;
      active = null;
      host?.synthesis.cancel();
    }
  }

  return {
    supported: host !== null,
    enable() {
      enabled = host !== null && !disposed;
      return enabled;
    },
    disable() {
      enabled = false;
      cancel();
    },
    cancel,
    speak(line: ChapterVoiceLine): ChapterVoiceResult {
      cancel();
      if (!enabled || disposed) return "disabled";
      if (!host) return "unavailable";
      const voice = selectChapterVoice(
        host.synthesis.getVoices(),
        line.speaker,
      );
      if (!voice) return "unavailable";
      const currentGeneration = generation;
      try {
        const utterance = host.makeUtterance(line.text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onend = () => {
          if (generation === currentGeneration) active = null;
        };
        utterance.onerror = () => {
          if (generation !== currentGeneration || disposed) return;
          active = null;
          onUnavailable();
        };
        active = utterance;
        host.synthesis.speak(utterance);
        return "spoken";
      } catch {
        cancel();
        return "unavailable";
      }
    },
    dispose() {
      enabled = false;
      disposed = true;
      cancel();
    },
  };
}

export type ChapterVoice = ReturnType<typeof createChapterVoice>;

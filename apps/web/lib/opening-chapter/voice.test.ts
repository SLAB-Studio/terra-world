import { describe, expect, it, vi } from "vitest";
import {
  createChapterVoice,
  selectChapterVoice,
  type ChapterVoiceHost,
} from "./voice";

function voice(name = "Samantha", localService = true, lang = "en-US") {
  return {
    name,
    localService,
    lang,
    default: true,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

function makeHost(voices = [voice()]) {
  const speak = vi.fn();
  const cancel = vi.fn();
  const makeUtterance = vi.fn(
    (text: string) => ({ text }) as SpeechSynthesisUtterance,
  );
  const host: ChapterVoiceHost = {
    synthesis: { getVoices: () => voices, speak, cancel },
    makeUtterance,
  };
  return { host, speak, cancel, makeUtterance };
}

describe("opening chapter device narration", () => {
  it("starts silent and requires explicit enabling", () => {
    const { host, speak } = makeHost();
    const controller = createChapterVoice(host);
    expect(
      controller.speak({ speaker: "Leo", text: "The bridge is closed." }),
    ).toBe("disabled");
    expect(speak).not.toHaveBeenCalled();
    expect(controller.enable()).toBe(true);
    expect(
      controller.speak({ speaker: "Leo", text: "The bridge is closed." }),
    ).toBe("spoken");
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it("replaces the active utterance and cancels on disable and dispose", () => {
    const { host, speak, cancel } = makeHost();
    const controller = createChapterVoice(host);
    controller.enable();
    controller.speak({ speaker: "Leo", text: "First line." });
    const first = speak.mock.calls[0]?.[0] as SpeechSynthesisUtterance;
    controller.speak({ speaker: "Maya", text: "Second line." });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(first.onerror).toBeNull();
    controller.disable();
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(controller.speak({ speaker: "Leo", text: "Muted." })).toBe(
      "disabled",
    );
    controller.enable();
    controller.speak({ speaker: "Leo", text: "Last line." });
    controller.dispose();
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(controller.enable()).toBe(false);
  });

  it("does not fall through to remote or non-English voices", () => {
    expect(
      selectChapterVoice(
        [voice("Cloud", false), voice("Local French", true, "fr-FR")],
        "Leo",
      ),
    ).toBeUndefined();
    const { host, speak } = makeHost([voice("Cloud", false)]);
    const controller = createChapterVoice(host);
    controller.enable();
    expect(
      controller.speak({ speaker: "Leo", text: "Subtitles still work." }),
    ).toBe("unavailable");
    expect(speak).not.toHaveBeenCalled();
  });

  it("works without speech support and can discover voices loaded later", () => {
    const unavailable = createChapterVoice(null);
    expect(unavailable.supported).toBe(false);
    expect(unavailable.enable()).toBe(false);
    const voices: SpeechSynthesisVoice[] = [];
    const { host } = makeHost(voices);
    const controller = createChapterVoice(host);
    controller.enable();
    expect(controller.speak({ speaker: "Leo", text: "First." })).toBe(
      "unavailable",
    );
    voices.push(voice());
    expect(controller.speak({ speaker: "Leo", text: "Second." })).toBe(
      "spoken",
    );
  });

  it("ignores stale errors after cancellation, but reports current failures", () => {
    const { host, speak } = makeHost();
    const onUnavailable = vi.fn();
    const controller = createChapterVoice(host, onUnavailable);
    controller.enable();
    controller.speak({ speaker: "Leo", text: "First." });
    const first = speak.mock.calls[0]?.[0] as SpeechSynthesisUtterance;
    const staleError = first.onerror;
    controller.cancel();
    staleError?.call(first, {} as SpeechSynthesisErrorEvent);
    expect(onUnavailable).not.toHaveBeenCalled();
    controller.speak({ speaker: "Leo", text: "Second." });
    const second = speak.mock.calls[1]?.[0] as SpeechSynthesisUtterance;
    second.onerror?.call(second, {} as SpeechSynthesisErrorEvent);
    expect(onUnavailable).toHaveBeenCalledOnce();
  });
});

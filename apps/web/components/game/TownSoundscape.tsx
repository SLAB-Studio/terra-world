"use client";

import { useEffect, useRef, useState } from "react";
import {
  canPlayTrafficHorn,
  subscribeTrafficHorn,
  subscribeTrafficHornContext,
  type TrafficHornContext,
} from "../../lib/immersive-town/traffic-horn";

const AUDIO_READY_EVENT = "terra-world-audio-ready";
let sharedAudioContext: AudioContext | null = null;

type TownSoundscapeProps = Readonly<{
  mode: "welcome" | "town";
  muted: boolean;
  onReadyChange: (ready: boolean) => void;
}>;

export async function requestTownAudioStart(): Promise<boolean> {
  try {
    sharedAudioContext ??= new AudioContext();
    if (sharedAudioContext.state === "running") return true;
    await sharedAudioContext.resume();
    const ready = String(sharedAudioContext.state) === "running";
    if (ready) window.dispatchEvent(new Event(AUDIO_READY_EVENT));
    return ready;
  } catch {
    return false;
  }
}

/**
 * A tiny Web Audio soundscape keeps music and town ambience asset-free and
 * private. Sounds are decorative, low-volume, and stop while the tab is hidden.
 */
export default function TownSoundscape({
  mode,
  muted,
  onReadyChange,
}: TownSoundscapeProps) {
  const mutedRef = useRef(muted);
  const [audioReady, setAudioReady] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      onReadyChange(false);
      void sharedAudioContext?.suspend();
    }
  }, [muted, onReadyChange]);

  useEffect(() => {
    function markReady() {
      onReadyChange(true);
      setAudioReady((value) => value + 1);
    }

    function unlockFromInteraction() {
      if (mutedRef.current) return;
      void requestTownAudioStart();
    }

    function handleVisibility() {
      setVisible(!document.hidden);
    }

    window.addEventListener(AUDIO_READY_EVENT, markReady);
    window.addEventListener("pointerdown", unlockFromInteraction, {
      passive: true,
    });
    window.addEventListener("keydown", unlockFromInteraction);
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();

    return () => {
      window.removeEventListener(AUDIO_READY_EVENT, markReady);
      window.removeEventListener("pointerdown", unlockFromInteraction);
      window.removeEventListener("keydown", unlockFromInteraction);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [onReadyChange]);

  useEffect(() => {
    const context = sharedAudioContext;
    if (muted || !visible || context === null || context.state !== "running")
      return;

    const timers: number[] = [];
    if (mode === "welcome") {
      playWelcomeTune(context);
      timers.push(window.setInterval(() => playWelcomeTune(context), 9_000));
    } else {
      let birdDelay = 2_400;
      const scheduleBird = () => {
        timers.push(
          window.setTimeout(() => {
            playBirdChirp(context);
            birdDelay = 6_500 + Math.round(Math.random() * 5_000);
            scheduleBird();
          }, birdDelay),
        );
      };
      scheduleBird();
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [audioReady, mode, muted, visible]);

  useEffect(() => {
    let trafficContext: TrafficHornContext = { paused: true };
    let stopHorn = () => {};
    const unsubscribeContext = subscribeTrafficHornContext((next) => {
      trafficContext = next;
      if (next.paused || next.inside || next.hidden) stopHorn();
    });
    const unsubscribeCue = subscribeTrafficHorn((cue) => {
      const context = sharedAudioContext;
      if (
        !context ||
        !canPlayTrafficHorn({
          muted: mutedRef.current,
          visible: visible && !document.hidden,
          audioReady: context.state === "running",
          mode,
          context: trafficContext,
        })
      )
        return;
      stopHorn();
      stopHorn = playCarHorn(context, cue.volume);
    });
    return () => {
      unsubscribeCue();
      unsubscribeContext();
      stopHorn();
    };
  }, [audioReady, mode, muted, visible]);

  return null;
}

function playWelcomeTune(context: AudioContext): void {
  const start = context.currentTime + 0.04;
  [523.25, 659.25, 783.99, 659.25, 698.46, 783.99].forEach((frequency, index) =>
    playTone(context, {
      frequency,
      start: start + index * 0.22,
      duration: 0.28,
      volume: 0.025,
      type: index % 2 === 0 ? "sine" : "triangle",
    }),
  );
}

function playBirdChirp(context: AudioContext): void {
  const start = context.currentTime + 0.02;
  [1_180, 1_520, 1_340].forEach((frequency, index) =>
    playTone(context, {
      frequency,
      start: start + index * 0.11,
      duration: 0.1,
      volume: 0.018,
      type: "sine",
    }),
  );
}

function playCarHorn(context: AudioContext, volume: number): () => void {
  const start = context.currentTime + 0.02;
  // Two short, soft toots belong to an observed obstruction, never a timer.
  const stops = [0, 0.21].flatMap((delay) =>
    [329.63, 392].map((frequency) =>
      playTone(context, {
        frequency,
        start: start + delay,
        duration: 0.12,
        volume: Math.min(0.01, volume),
        type: "triangle",
      }),
    ),
  );
  return () => stops.forEach((stop) => stop());
}

function playTone(
  context: AudioContext,
  options: Readonly<{
    duration: number;
    frequency: number;
    start: number;
    type: OscillatorType;
    volume: number;
  }>,
): () => void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(options.frequency, options.start);
  oscillator.type = options.type;
  gain.gain.setValueAtTime(0.0001, options.start);
  gain.gain.exponentialRampToValueAtTime(options.volume, options.start + 0.025);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    options.start + options.duration,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
  oscillator.start(options.start);
  oscillator.stop(options.start + options.duration + 0.04);
  return () => {
    // Pause/mute/interior changes cancel even a scheduled second toot.
    try {
      oscillator.stop();
    } catch {
      /* Already ended. */
    }
    oscillator.disconnect();
    gain.disconnect();
  };
}

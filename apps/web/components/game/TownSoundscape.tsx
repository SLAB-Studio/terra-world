"use client";

import { useEffect, useRef, useState } from "react";

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
      let hornDelay = 8_500;
      const scheduleBird = () => {
        timers.push(
          window.setTimeout(() => {
            playBirdChirp(context);
            birdDelay = 6_500 + Math.round(Math.random() * 5_000);
            scheduleBird();
          }, birdDelay),
        );
      };
      const scheduleHorn = () => {
        timers.push(
          window.setTimeout(() => {
            playCarHorn(context);
            hornDelay = 15_000 + Math.round(Math.random() * 9_000);
            scheduleHorn();
          }, hornDelay),
        );
      };
      scheduleBird();
      scheduleHorn();
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
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

function playCarHorn(context: AudioContext): void {
  const start = context.currentTime + 0.02;
  [329.63, 392].forEach((frequency) =>
    playTone(context, {
      frequency,
      start,
      duration: 0.24,
      volume: 0.012,
      type: "triangle",
    }),
  );
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
): void {
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
  oscillator.start(options.start);
  oscillator.stop(options.start + options.duration + 0.04);
}

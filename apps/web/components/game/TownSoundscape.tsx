"use client";

import { useEffect, useRef, useState } from "react";

const AUDIO_UNLOCK_EVENT = "terra-world-audio-unlock";

type TownSoundscapeProps = Readonly<{
  mode: "welcome" | "town";
  muted: boolean;
}>;

export function requestTownAudioStart(): void {
  window.dispatchEvent(new Event(AUDIO_UNLOCK_EVENT));
}

/**
 * A tiny Web Audio soundscape keeps music and town ambience asset-free and
 * private. Sounds are decorative, low-volume, and stop while the tab is hidden.
 */
export default function TownSoundscape({ mode, muted }: TownSoundscapeProps) {
  const contextRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(muted);
  const readyRef = useRef(false);
  const [audioReady, setAudioReady] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    mutedRef.current = muted;
    if (muted) {
      readyRef.current = false;
      void contextRef.current?.suspend();
    }
  }, [muted]);

  useEffect(() => {
    function unlock() {
      if (mutedRef.current) return;
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      if (readyRef.current && context.state === "running") return;
      void context.resume().then(() => {
        if (readyRef.current) return;
        readyRef.current = true;
        setAudioReady((value) => value + 1);
      });
    }

    function handleVisibility() {
      setVisible(!document.hidden);
    }

    window.addEventListener(AUDIO_UNLOCK_EVENT, unlock);
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", handleVisibility);
    if (!muted) unlock();

    return () => {
      window.removeEventListener(AUDIO_UNLOCK_EVENT, unlock);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [muted]);

  useEffect(() => {
    const context = contextRef.current;
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

  useEffect(
    () => () => {
      void contextRef.current?.close();
      contextRef.current = null;
    },
    [],
  );

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

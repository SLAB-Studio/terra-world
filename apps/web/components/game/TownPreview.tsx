"use client";

import { useEffect, useRef, useState } from "react";

/** A low-cost view of the actual game, not concept art promising another world.
 * Unmounting the menu releases this engine before the playable city mounts. */
export default function TownPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  const syncPlaybackRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    pauseRef.current = paused;
    syncPlaybackRef.current?.();
  }, [paused]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    async function start() {
      try {
        const [{ Engine }, { createImmersiveTownWorld }] = await Promise.all([
          import("../../lib/immersive-town/babylon-runtime"),
          import("../../lib/immersive-town/create-town-world"),
        ]);
        if (cancelled || canvasRef.current === null) return;
        const canvas = canvasRef.current;
        const engine = new Engine(
          canvas,
          false,
          {
            preserveDrawingBuffer: false,
            stencil: false,
            powerPreference: "default",
          },
          false,
        );
        engine.setHardwareScalingLevel(
          1 / Math.min(window.devicePixelRatio || 1, 0.8),
        );
        try {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
          const world = createImmersiveTownWorld(engine, {
            attachCameraControls: false,
            quality: "low",
            reducedMotion: reduced.matches,
          });
          world.setTimeOfDay("night");
          world.camera.radius = 110;
          world.camera.beta = 1.06;
          const initialAngle = world.camera.alpha;
          let last = 0;
          let travel = 0;
          let onscreen = true;
          let rendering = false;
          const render = () => {
            if (
              document.hidden ||
              !onscreen ||
              pauseRef.current ||
              reduced.matches
            )
              return;
            const now = performance.now();
            if (now - last < 1000 / 24) return;
            const delta = Math.min((now - last) / 1000, 0.05);
            last = now;
            world.animation.setPaused(pauseRef.current || reduced.matches);
            if (!pauseRef.current && !reduced.matches) {
              travel += delta;
              world.camera.alpha =
                initialAngle + Math.sin(travel * 0.035) * 0.13;
            }
            world.render();
          };
          const visibility = () => {
            const inactive =
              document.hidden ||
              !onscreen ||
              pauseRef.current ||
              reduced.matches;
            world.animation.setPaused(inactive);
            world.animation.setReducedMotion(reduced.matches);
            if (inactive) {
              engine.stopRenderLoop(render);
              rendering = false;
              if (!document.hidden && onscreen) world.render();
            } else if (!rendering) {
              last = performance.now();
              engine.runRenderLoop(render);
              rendering = true;
            }
          };
          syncPlaybackRef.current = visibility;
          const resize = new ResizeObserver(() => {
            world.resize();
            if (!rendering && !document.hidden && onscreen) world.render();
          });
          const intersection = new IntersectionObserver(
            ([entry]) => {
              onscreen = entry?.isIntersecting === true;
              visibility();
            },
            { threshold: 0.01 },
          );
          resize.observe(canvas);
          intersection.observe(canvas);
          reduced.addEventListener("change", visibility);
          document.addEventListener("visibilitychange", visibility);
          world.render();
          visibility();
          setStatus("ready");
          cleanup = () => {
            syncPlaybackRef.current = null;
            document.removeEventListener("visibilitychange", visibility);
            reduced.removeEventListener("change", visibility);
            resize.disconnect();
            intersection.disconnect();
            engine.stopRenderLoop(render);
            world.dispose();
            engine.dispose();
          };
        } catch (error) {
          engine.dispose();
          throw error;
        }
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    }
    // Let the name and Start/Continue controls paint before building scenery.
    const startTimer = window.setTimeout(() => {
      void start();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      cleanup?.();
    };
  }, []);

  return (
    <div className="landing-live-world">
      <canvas ref={canvasRef} aria-label="Live 3D view of Rivergate at night" />
      {status !== "ready" && (
        <p className="landing-world-loading" role="status">
          {status === "loading"
            ? "Opening a window onto Rivergate…"
            : "The city preview is unavailable. You can still enter the game."}
        </p>
      )}
      {status === "ready" && (
        <button
          className="landing-preview-pause"
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "Resume city preview" : "Pause city preview"}
        </button>
      )}
    </div>
  );
}

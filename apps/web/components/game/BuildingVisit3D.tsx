"use client";

import { startCanvasRenderLoop } from "../../lib/immersive-town/canvas-render-loop";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TOWN_VENUES,
  venueFloorDescription,
  type TownVenue,
} from "../../lib/immersive-town/venue-catalog";
import type { TownTimeOfDay } from "../../lib/immersive-town/types";
import type { VenueWorld } from "../../lib/immersive-town/venue-world";
import type { InteriorCommand } from "../../lib/immersive-town/interior-walker";
import styles from "./BuildingVisit3D.module.css";

type Home = { id: string; displayName: string };
type Props = {
  venue: TownVenue | null;
  timeOfDay: TownTimeOfDay;
  homes: readonly Home[];
  onVisit(venue: TownVenue): void;
  onHome(home: Home): void;
  onClose(): void;
};

export default function BuildingVisit3D({
  venue,
  timeOfDay,
  homes,
  onVisit,
  onHome,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floorRef = useRef<HTMLSelectElement>(null);
  const worldRef = useRef<VenueWorld | null>(null);
  const callbacksRef = useRef({ onClose });
  callbacksRef.current = { onClose };
  const [floorIndex, setFloorIndex] = useState(0);
  const [nearby, setNearby] = useState<"floor" | "exit" | "lift" | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  const press = useRef(new Map<number, number>());

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!venue) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    setNearby(null);
    async function mount() {
      let disposeEngine: (() => void) | undefined;
      try {
        const [Babylon, interior] = await Promise.all([
          import("../../lib/immersive-town/babylon-runtime"),
          import("../../lib/immersive-town/venue-world"),
        ]);
        if (cancelled || !canvasRef.current || !venue) return;
        const engine = new Babylon.Engine(
          canvasRef.current,
          false,
          {
            audioEngine: false,
            stencil: true,
            antialias: false,
            preserveDrawingBuffer: false,
            powerPreference: "default",
          },
          false,
        );
        disposeEngine = () => engine.dispose();
        const world = interior.createVenueWorld(
          engine,
          venue,
          floorIndex,
          timeOfDay,
          {
            onNearby: setNearby,
            onExit: () => callbacksRef.current.onClose(),
            onLift: () => floorRef.current?.focus(),
          },
        );
        worldRef.current = world;
        const renderLoop = startCanvasRenderLoop({
          engine,
          canvas: canvasRef.current,
          render: () => world.scene.render(),
          onPause: () => world.walker.clearInput(),
          onQuality: (quality) => {
            world.scene.shadowsEnabled = quality !== "low";
          },
        });
        cleanup = () => {
          renderLoop.dispose();
          world.dispose();
          engine.dispose();
          worldRef.current = null;
        };
        if (cancelled) {
          cleanup();
          return;
        }
        setStatus("ready");
      } catch (error) {
        disposeEngine?.();
        console.error("Could not open this building", error);
        if (!cancelled) setStatus("failed");
      }
    }
    void mount();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [venue, floorIndex, timeOfDay, retry]);

  const movementButton = (command: InteriorCommand, label: string) => (
    <button
      key={command}
      type="button"
      className={styles[command]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        press.current.set(e.pointerId, performance.now());
        e.currentTarget.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        worldRef.current?.walker.hold(command, true);
      }}
      onPointerUp={(e) => {
        worldRef.current?.walker.hold(command, false);
        const start = press.current.get(e.pointerId);
        if (start !== undefined && performance.now() - start < 160)
          worldRef.current?.walker.nudge(command);
        press.current.delete(e.pointerId);
      }}
      onPointerCancel={(e) => {
        press.current.delete(e.pointerId);
        worldRef.current?.walker.hold(command, false);
      }}
      onLostPointerCapture={() => worldRef.current?.walker.hold(command, false)}
      onClick={(e) => {
        if (e.detail === 0) worldRef.current?.walker.nudge(command);
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="visit-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2 id="visit-title">{venue?.name ?? "Where shall we go?"}</h2>
        </div>
        <button type="button" onClick={onClose}>
          Back to town
        </button>
      </header>
      {venue ? (
        <>
          <div className={styles.floorBar}>
            {venue.floors.length > 1 ? (
              <label>
                Lift to a floor
                <select
                  ref={floorRef}
                  value={floorIndex}
                  onChange={(e) => setFloorIndex(Number(e.target.value))}
                >
                  {venue.floors.map((floor, i) => (
                    <option key={i} value={i}>
                      {floor.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <strong>{venue.floors[0]?.label}</strong>
            )}
            <span>
              Drag to look · hold a button to walk
              <span className={styles.keyboard}>
                {" "}
                · W A S D to move · E at doors
              </span>
            </span>
            {venue.kind === "apartments" ? (
              <button
                type="button"
                onClick={() =>
                  onHome({ id: venue.id, displayName: venue.name })
                }
              >
                Help these neighbours
              </button>
            ) : null}
          </div>
          <section
            className={styles.stage}
            aria-label={`Explore ${venue.name} in 3D`}
          >
            <canvas
              ref={canvasRef}
              tabIndex={0}
              aria-label={`Inside ${venue.name}, ${venue.floors[floorIndex]?.label}. Drag to look and use W A S D or the walking buttons to move.`}
            />
            {status !== "ready" ? (
              <div
                className={styles.status}
                role={status === "failed" ? "alert" : "status"}
              >
                <strong>
                  {status === "loading"
                    ? "Opening the doors…"
                    : "This room couldn’t load."}
                </strong>
                {status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div
                  className={styles.controls}
                  role="group"
                  aria-label="Walk around this place"
                >
                  {movementButton("forward", "Forward")}
                  {movementButton("left", "Turn left")}
                  {movementButton("back", "Back")}
                  {movementButton("right", "Turn right")}
                </div>
                <div className={styles.nearby} aria-live="polite">
                  {nearby === "exit" ? (
                    <button type="button" onClick={onClose}>
                      Go outside
                    </button>
                  ) : nearby === "lift" ? (
                    <button
                      type="button"
                      onClick={() => floorRef.current?.focus()}
                    >
                      Choose a floor ↑
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
          <p className={styles.description}>
            {venueFloorDescription(venue, floorIndex)}
          </p>
        </>
      ) : (
        <div className={styles.directory}>
          <p>
            Every door has somewhere to explore. Pick a place, or click its
            building in the town.
          </p>
          <h3>Places to discover</h3>
          <div className={styles.destinations}>
            {TOWN_VENUES.map((place) => (
              <button
                type="button"
                key={place.id}
                onClick={() => onVisit(place)}
              >
                <strong>{place.name}</strong>
                <span>
                  {place.outdoor
                    ? "Open-air visit"
                    : `${place.floors.length} ${place.floors.length === 1 ? "floor" : "floors"} to explore`}{" "}
                  →
                </span>
              </button>
            ))}
          </div>
          <h3>Visit a neighbour</h3>
          <div className={styles.destinations}>
            {homes
              .filter((home) => !home.id.startsWith("district-apartments-"))
              .map((home) => (
                <button
                  key={home.id}
                  type="button"
                  onClick={() => onHome(home)}
                >
                  <strong>{home.displayName}</strong>
                  <span>Home & garden →</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}

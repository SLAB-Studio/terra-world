"use client";

import { memo, useEffect, useRef, useState } from "react";

import {
  INTERIOR_ROOMS,
  type HouseInteriorWorld,
  type InteriorRoomId,
  type InteriorUpgradeId,
} from "../../lib/immersive-town/house-interior-world";
import type { HouseId } from "./HouseDiagnostics";
import { ROOM_TASKS } from "../../lib/immersive-town/interior-navigation";
import type { InteriorCommand } from "../../lib/immersive-town/interior-walker";
import styles from "./HouseInterior3D.module.css";

type HouseInterior3DProps = Readonly<{
  houseId: HouseId;
  upgrades: readonly InteriorUpgradeId[];
  selectedRoomId: InteriorRoomId | null;
  onRoomSelect: (roomId: InteriorRoomId | null) => void;
  onRepair: (upgradeId: InteriorUpgradeId) => void;
}>;

type InteriorRuntime = Readonly<{
  world: HouseInteriorWorld;
  reducedMotionQuery: MediaQueryList;
  dispose(): void;
}>;

function HouseInterior3D({
  houseId,
  upgrades,
  selectedRoomId,
  onRoomSelect,
  onRepair,
}: HouseInterior3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<InteriorRuntime | null>(null);
  const upgradesRef = useRef(upgrades);
  const selectedRoomIdRef = useRef(selectedRoomId);
  const callbacksRef = useRef({ onRoomSelect, onRepair });
  callbacksRef.current = { onRoomSelect, onRepair };
  const pressStarted = useRef(new Map<number, number>());
  const [nearbyRoom, setNearbyRoom] = useState<InteriorRoomId | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  upgradesRef.current = upgrades;
  selectedRoomIdRef.current = selectedRoomId;

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");

    async function mountInterior() {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      try {
        const [Babylon, interior] = await Promise.all([
          import("../../lib/immersive-town/babylon-runtime"),
          import("../../lib/immersive-town/house-interior-world"),
        ]);
        if (cancelled) return;
        const engine = new Babylon.Engine(
          canvas,
          true,
          {
            antialias: true,
            audioEngine: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            stencil: true,
          },
          true,
        );
        const mobile = window.matchMedia("(max-width: 590px)").matches;
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        engine.setHardwareScalingLevel(
          1 / Math.min(pixelRatio, mobile ? 1 : 1.35),
        );
        const reducedMotionQuery = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        const world = interior.createHouseInteriorWorld(
          engine,
          houseId,
          upgradesRef.current,
          {
            onRoomChange: (room) => callbacksRef.current.onRoomSelect(room),
            onNearbyChange: setNearbyRoom,
            onInteract: (roomId) => {
              const room = INTERIOR_ROOMS.find((entry) => entry.id === roomId);
              if (room && !upgradesRef.current.includes(room.upgradeId))
                callbacksRef.current.onRepair(room.upgradeId);
            },
          },
        );
        world.focusRoom(selectedRoomIdRef.current, reducedMotionQuery.matches);
        const renderFrame = () => world.scene.render();
        engine.runRenderLoop(renderFrame);
        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvas);
        const runtime: InteriorRuntime = {
          world,
          reducedMotionQuery,
          dispose() {
            resizeObserver.disconnect();
            engine.stopRenderLoop(renderFrame);
            world.dispose();
            engine.dispose();
          },
        };
        if (cancelled) {
          runtime.dispose();
          return;
        }
        runtimeRef.current = runtime;
        cleanup = () => {
          runtime.dispose();
          runtimeRef.current = null;
        };
        setStatus("ready");
      } catch (error) {
        console.error("The 3D home interior could not start", error);
        if (!cancelled) setStatus("failed");
      }
    }

    void mountInterior();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [houseId]);

  useEffect(() => {
    runtimeRef.current?.world.setInstalled(upgrades);
  }, [upgrades]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    runtime.world.focusRoom(selectedRoomId, runtime.reducedMotionQuery.matches);
  }, [selectedRoomId]);

  const walking = selectedRoomId !== null && status === "ready";
  const currentRoom = INTERIOR_ROOMS.find((room) => room.id === selectedRoomId);
  const near = INTERIOR_ROOMS.find((room) => room.id === nearbyRoom);
  const movementButton = (command: InteriorCommand, label: string) => (
    <button
      key={command}
      className={styles[command]}
      type="button"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pressStarted.current.set(event.pointerId, performance.now());
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        runtimeRef.current?.world.walker.hold(command, true);
      }}
      onPointerUp={(event) => {
        runtimeRef.current?.world.walker.hold(command, false);
        const start = pressStarted.current.get(event.pointerId);
        if (start !== undefined && performance.now() - start < 160)
          runtimeRef.current?.world.walker.nudge(command);
        pressStarted.current.delete(event.pointerId);
      }}
      onPointerCancel={(event) => {
        pressStarted.current.delete(event.pointerId);
        runtimeRef.current?.world.walker.hold(command, false);
      }}
      onLostPointerCapture={() =>
        runtimeRef.current?.world.walker.hold(command, false)
      }
      onClick={(event) => {
        if (event.detail === 0) runtimeRef.current?.world.walker.nudge(command);
      }}
    >
      {label}
    </button>
  );

  return (
    <section
      aria-label="Walk through the 3D rooms"
      className={`${styles.stage}${walking ? ` ${styles.walking}` : ""}`}
    >
      <canvas
        aria-label={
          walking
            ? "Inside the house. W A S D to walk, arrow keys to turn, drag to look, E to repair a nearby object."
            : "3D house overview. Choose a room to enter."
        }
        tabIndex={0}
        ref={canvasRef}
      />
      {status === "ready" && selectedRoomId === null ? (
        <div className={styles.roomPickLayer}>
          {INTERIOR_ROOMS.map((room) => (
            <button
              aria-label={`Walk into the ${room.label} in 3D`}
              className={styles[`pick_${room.id}`]}
              key={room.id}
              onClick={() => onRoomSelect(room.id)}
              tabIndex={-1}
              type="button"
            >
              <span>{room.shortLabel}</span>
            </button>
          ))}
        </div>
      ) : null}
      {status === "loading" ? (
        <div className={styles.status} role="status">
          <strong>Opening the front door…</strong>
          <span>Getting every room ready.</span>
        </div>
      ) : null}
      {status === "failed" ? (
        <div className={styles.status} role="alert">
          <strong>The rooms need graphics support.</strong>
          <span>Use the room buttons to keep helping.</span>
        </div>
      ) : null}

      {!walking ? (
        <nav aria-label="Rooms in this home" className={styles.roomNav}>
          {INTERIOR_ROOMS.map((room) => {
            const healthy = upgrades.includes(room.upgradeId);
            const selected = selectedRoomId === room.id;
            return (
              <button
                aria-pressed={selected}
                className={`${styles.roomButton}${selected ? ` ${styles.selected}` : ""}${healthy ? ` ${styles.healthy}` : ""}`}
                key={room.id}
                onClick={() => onRoomSelect(room.id)}
                type="button"
              >
                <span aria-hidden="true" className={styles.roomDot} />
                <span>{room.shortLabel}</span>
                <small>{healthy ? "Ready" : "Needs help"}</small>
              </button>
            );
          })}
        </nav>
      ) : null}

      {walking ? (
        <>
          <div className={styles.walkHelp}>
            <strong>{currentRoom?.label}</strong>
            <span>Drag to look. Walk through the open doors.</span>
            <small>W A S D to move · arrows to turn · E to repair</small>
          </div>
          <div
            aria-label="Walk inside the house"
            className={styles.walkControls}
          >
            {movementButton("forward", "Forward")}
            {movementButton("left", "Turn left")}
            {movementButton("back", "Back")}
            {movementButton("right", "Turn right")}
          </div>
          <div className={styles.nearbyTask} aria-live="polite">
            {near ? (
              upgrades.includes(near.upgradeId) ? (
                <p>{near.healthy}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => runtimeRef.current?.world.walker.interact()}
                >
                  Help the {ROOM_TASKS[near.id].label}
                </button>
              )
            ) : (
              <p>
                Walk closer to the{" "}
                {currentRoom
                  ? ROOM_TASKS[currentRoom.id].label
                  : "room’s objects"}
                .
              </p>
            )}
          </div>
        </>
      ) : null}

      {selectedRoomId !== null ? (
        <button
          className={styles.overviewButton}
          onClick={() => onRoomSelect(null)}
          type="button"
        >
          ← See all rooms
        </button>
      ) : (
        <p className={styles.hint}>Choose a room to walk inside</p>
      )}
    </section>
  );
}

export default memo(HouseInterior3D);

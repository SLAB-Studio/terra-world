"use client";

import { memo, useEffect, useRef, useState } from "react";

import {
  INTERIOR_ROOMS,
  type HouseInteriorWorld,
  type InteriorRoomId,
  type InteriorUpgradeId,
} from "../../lib/immersive-town/house-interior-world";
import type { HouseId } from "./HouseDiagnostics";
import styles from "./HouseInterior3D.module.css";

type HouseInterior3DProps = Readonly<{
  houseId: HouseId;
  upgrades: readonly InteriorUpgradeId[];
  selectedRoomId: InteriorRoomId | null;
  onRoomSelect: (roomId: InteriorRoomId | null) => void;
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
}: HouseInterior3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<InteriorRuntime | null>(null);
  const onRoomSelectRef = useRef(onRoomSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  onRoomSelectRef.current = onRoomSelect;

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
          upgrades,
        );
        world.focusRoom(selectedRoomId, reducedMotionQuery.matches);

        const pointerObserver = world.scene.onPointerObservable.add(
          (pointer) => {
            if (pointer.type !== Babylon.PointerEventTypes.POINTERPICK) return;
            const roomId = world.getRoomFromMesh(
              pointer.pickInfo?.pickedMesh ?? null,
            );
            if (roomId !== null) onRoomSelectRef.current(roomId);
          },
        );
        const renderFrame = () => world.scene.render();
        engine.runRenderLoop(renderFrame);
        const resizeObserver = new ResizeObserver(() => engine.resize());
        resizeObserver.observe(canvas);
        const runtime: InteriorRuntime = {
          world,
          reducedMotionQuery,
          dispose() {
            resizeObserver.disconnect();
            if (pointerObserver !== null)
              world.scene.onPointerObservable.remove(pointerObserver);
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
    runtime.world.focusRoom(
      selectedRoomId,
      runtime.reducedMotionQuery.matches,
    );
  }, [selectedRoomId]);

  return (
    <section
      aria-label="Walk through the 3D rooms"
      className={styles.stage}
    >
      <canvas aria-hidden="true" ref={canvasRef} />
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

      <nav aria-label="Rooms in this home" className={styles.roomNav}>
        {INTERIOR_ROOMS.map((room) => {
          const healthy = upgrades.includes(room.upgradeId);
          const selected = selectedRoomId === room.id;
          return (
            <button
              aria-pressed={selected}
              className={`${styles.roomButton}${selected ? ` ${styles.selected}` : ""}${healthy ? ` ${styles.healthy}` : ""}`}
              disabled={status !== "ready"}
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

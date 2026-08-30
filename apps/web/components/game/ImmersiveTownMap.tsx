"use client";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { HouseUpgradeVisuals } from "../../lib/immersive-town/house-upgrades-3d";
import type { ImmersiveTownWorld } from "../../lib/immersive-town/types";
import type {
  TownWalker,
  WalkCommand,
} from "../../lib/immersive-town/town-walker";
import type { VehicleFleet } from "../../lib/immersive-town/vehicles-3d";
import type { HouseId, HouseUpgradeId } from "./HouseDiagnostics";
import "./TownWalking.css";

export type NeighborhoodHouseSelection = Readonly<{
  id: string;
  displayName: string;
}>;

type ImmersiveTownMapProps = Readonly<{
  timeOfDay: "day" | "night";
  activeUpgradeId: HouseUpgradeId | null;
  houses: Readonly<Record<HouseId, readonly HouseUpgradeId[]>>;
  onHouseDrop: (houseId: HouseId, upgradeId: HouseUpgradeId) => void;
  onHouseSelect: (houseId: HouseId) => void;
  onWalkStart: () => void;
  onNeighborhoodHouseDrop: (
    house: NeighborhoodHouseSelection,
    upgradeId: HouseUpgradeId,
  ) => void;
  onNeighborhoodHouseSelect: (house: NeighborhoodHouseSelection) => void;
  selectedNeighborhoodHouseId: string | null;
  selectedHouseId: HouseId | null;
}>;

type RuntimeHandle = Readonly<{
  camera: ArcRotateCamera;
  upgrades: HouseUpgradeVisuals;
  vehicles: VehicleFleet;
  world: ImmersiveTownWorld;
  walker: TownWalker;
  cancelCameraAnimation(): void;
  resetCamera(): void;
  focusHouse(houseId: string): void;
  dispose(): void;
}>;

/**
 * Babylon.js owns the real 3D world, camera, lighting, picking and simulation.
 * React remains authoritative for learning state and the accessible house UI.
 */
function ImmersiveTownMap({
  timeOfDay,
  activeUpgradeId,
  houses,
  onHouseDrop,
  onHouseSelect,
  onWalkStart,
  onNeighborhoodHouseDrop,
  onNeighborhoodHouseSelect,
  selectedNeighborhoodHouseId,
  selectedHouseId,
}: ImmersiveTownMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RuntimeHandle | null>(null);
  const timeOfDayRef = useRef(timeOfDay);
  timeOfDayRef.current = timeOfDay;
  useEffect(() => {
    runtimeRef.current?.world.setTimeOfDay(timeOfDay);
    runtimeRef.current?.vehicles.setNight(timeOfDay === "night");
  }, [timeOfDay]);
  const walkPressStartedRef = useRef(0);
  const [viewMode, setViewMode] = useState<"town" | "walk">("town");
  const [nearbyHouse, setNearbyHouse] =
    useState<NeighborhoodHouseSelection | null>(null);
  const propsRef = useRef({
    activeUpgradeId,
    houses,
    onHouseDrop,
    onHouseSelect,
    onNeighborhoodHouseDrop,
    onNeighborhoodHouseSelect,
    selectedNeighborhoodHouseId,
    selectedHouseId,
  });
  const [engineStatus, setEngineStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");

  propsRef.current = {
    activeUpgradeId,
    houses,
    onHouseDrop,
    onHouseSelect,
    onNeighborhoodHouseDrop,
    onNeighborhoodHouseSelect,
    selectedNeighborhoodHouseId,
    selectedHouseId,
  };

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function mountEngine() {
      const canvas = canvasRef.current;
      if (canvas === null) return;

      try {
        const [
          Babylon,
          town,
          cameraTools,
          trafficTools,
          vehicleTools,
          upgradeTools,
          adapterTools,
          walkingTools,
        ] = await Promise.all([
          import("../../lib/immersive-town/babylon-runtime"),
          import("../../lib/immersive-town"),
          import("../../lib/immersive-town/camera"),
          import("../../lib/immersive-town/traffic"),
          import("../../lib/immersive-town/vehicles-3d"),
          import("../../lib/immersive-town/house-upgrades-3d"),
          import("../../lib/immersive-town/babylon-adapter"),
          import("../../lib/immersive-town/town-walker"),
        ]);
        if (cancelled) return;

        const mobile = window.matchMedia("(max-width: 760px)").matches;
        const reducedMotionQuery = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
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
        const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const targetPixelRatio = mobile ? 1 : 1.5;
        engine.setHardwareScalingLevel(
          1 / Math.min(devicePixelRatio, targetPixelRatio),
        );

        const world = town.createImmersiveTownWorld(engine, {
          attachCameraControls: true,
          quality: mobile ? "low" : "medium",
          reducedMotion: reducedMotionQuery.matches,
        });
        adapterTools.configureKidFriendlyCamera(world.camera);
        const walker = walkingTools.createTownWalker(world, canvas, {
          isBlocked: () =>
            propsRef.current.selectedHouseId !== null ||
            propsRef.current.selectedNeighborhoodHouseId !== null ||
            propsRef.current.activeUpgradeId !== null,
          onNearbyHouse: (house) =>
            setNearbyHouse(
              house === null
                ? null
                : {
                    id: house.id,
                    displayName: house.displayName,
                  },
            ),
          onEnterHouse: (house) => {
            if (isHouseId(house.id)) propsRef.current.onHouseSelect(house.id);
            else
              propsRef.current.onNeighborhoodHouseSelect({
                id: house.id,
                displayName: house.displayName,
              });
          },
        });
        const upgrades = upgradeTools.createHouseUpgradeVisuals(
          world.scene,
          world.houses,
        );
        upgrades.setReducedMotion(reducedMotionQuery.matches);
        let traffic = trafficTools.createTrafficSimulation();
        const vehicles = vehicleTools.createVehicleFleet(
          world.scene,
          traffic.vehicles.map((vehicle) => vehicle.id),
        );
        vehicles.sync(trafficTools.getVehicleTransforms(traffic), 0);
        world.setTimeOfDay(timeOfDayRef.current);
        vehicles.setNight(timeOfDayRef.current === "night");
        upgrades.sync(
          propsRef.current.houses,
          propsRef.current.selectedHouseId,
        );

        const unsubscribeAnimation = world.animation.subscribe((frame) => {
          traffic = trafficTools.stepTraffic(traffic, frame.deltaSeconds, {
            reducedMotion: frame.reducedMotion,
          });
          vehicles.sync(
            trafficTools.getVehicleTransforms(traffic),
            traffic.elapsedSeconds,
          );
        });

        let cancelCameraAnimation: () => void = () => undefined;
        let hoveredHouseId: string | null = null;
        const setHoveredHouse = (houseId: string | null) => {
          if (houseId === hoveredHouseId) return;
          world.houses.forEach((house) => {
            const highlighted = house.id === houseId;
            house.meshes.forEach((mesh) => {
              mesh.renderOutline = highlighted;
              mesh.outlineColor = Babylon.Color3.FromHexString("#FFD24A");
              mesh.outlineWidth = 0.08;
            });
          });
          hoveredHouseId = houseId;
          canvas.style.cursor = houseId === null ? "grab" : "pointer";
        };
        const pickObserver = world.scene.onPointerObservable.add((pointer) => {
          if (pointer.type === Babylon.PointerEventTypes.POINTERMOVE) {
            const hovered = world.getHouseFromMesh(
              pointer.pickInfo?.pickedMesh ?? null,
            );
            setHoveredHouse(hovered?.id ?? null);
            return;
          }
          if (pointer.type === Babylon.PointerEventTypes.POINTERDOWN) {
            cancelCameraAnimation();
            return;
          }
          if (pointer.type !== Babylon.PointerEventTypes.POINTERPICK) return;
          const house = world.getHouseFromMesh(
            pointer.pickInfo?.pickedMesh ?? null,
          );
          if (house === null) return;
          const active = propsRef.current.activeUpgradeId;
          if (active !== null) return;
          if (walker.active) {
            walker.enterHouse(house.id);
            return;
          }
          if (isHouseId(house.id)) {
            propsRef.current.onHouseSelect(house.id);
          } else {
            propsRef.current.onNeighborhoodHouseSelect({
              id: house.id,
              displayName: house.displayName,
            });
          }
        });

        const dropUpgradeOnHouse = (event: PointerEvent) => {
          const active = propsRef.current.activeUpgradeId;
          if (active === null) return;
          const bounds = canvas.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            return;
          const x = event.clientX - bounds.left;
          const y = event.clientY - bounds.top;
          const house = world.getHouseFromMesh(
            world.scene.pick(x, y)?.pickedMesh ?? null,
          );
          if (house === null) return;
          if (isHouseId(house.id)) {
            propsRef.current.onHouseDrop(house.id, active);
          } else {
            propsRef.current.onNeighborhoodHouseDrop(
              { id: house.id, displayName: house.displayName },
              active,
            );
          }
        };
        window.addEventListener("pointerup", dropUpgradeOnHouse);

        const clampCameraObserver = world.scene.onBeforeRenderObservable.add(
          () => {
            const pose = cameraTools.clampCameraPose({
              alpha: world.camera.alpha,
              beta: world.camera.beta,
              radius: world.camera.radius,
              target: {
                x: world.camera.target.x,
                y: world.camera.target.y,
                z: world.camera.target.z,
              },
            });
            world.camera.target.copyFromFloats(
              pose.target.x,
              pose.target.y,
              pose.target.z,
            );
          },
        );

        const resetCamera = () => {
          cancelCameraAnimation();
          cancelCameraAnimation = animateCamera(
            world.camera,
            cameraTools.cameraPoseForPreset("welcome"),
            cameraTools,
            reducedMotionQuery.matches,
          );
        };
        const focusHouse = (houseId: string) => {
          if (walker.active) return;
          const house = world.houses.find((item) => item.id === houseId);
          if (house === undefined) return;
          const target = cameraTools.cameraTargetForWorldPoint({
            x: house.worldPosition.x,
            y: house.worldPosition.y,
            z: house.worldPosition.z,
          });
          cancelCameraAnimation();
          cancelCameraAnimation = animateCamera(
            world.camera,
            cameraTools.cameraPoseForPreset("explore", target),
            cameraTools,
            reducedMotionQuery.matches,
          );
        };

        const runtime: RuntimeHandle = {
          camera: world.camera,
          upgrades,
          vehicles,
          world,
          walker,
          cancelCameraAnimation: () => cancelCameraAnimation(),
          resetCamera,
          focusHouse,
          dispose() {
            cancelCameraAnimation();
            walker.dispose();
            setHoveredHouse(null);
            unsubscribeAnimation();
            if (pickObserver !== null)
              world.scene.onPointerObservable.remove(pickObserver);
            if (clampCameraObserver !== null)
              world.scene.onBeforeRenderObservable.remove(clampCameraObserver);
            window.removeEventListener("pointerup", dropUpgradeOnHouse);
            vehicles.dispose();
            upgrades.dispose();
            world.dispose();
            engine.stopRenderLoop();
            engine.dispose();
          },
        };
        if (cancelled) {
          runtime.dispose();
          return;
        }
        runtimeRef.current = runtime;

        const resizeObserver = new ResizeObserver(() => world.resize());
        resizeObserver.observe(canvas);
        let isOnscreen = true;
        let isPageVisible = document.visibilityState === "visible";
        let isRendering = false;
        const renderFrame = () => world.render();
        const syncPauseState = () => {
          const paused = !isOnscreen || !isPageVisible;
          if (paused) walker.clearInput();
          world.animation.setPaused(paused);
          if (paused && isRendering) {
            engine.stopRenderLoop(renderFrame);
            isRendering = false;
          } else if (!paused && !isRendering) {
            engine.runRenderLoop(renderFrame);
            isRendering = true;
          }
        };
        const intersectionObserver = new IntersectionObserver(
          ([entry]) => {
            isOnscreen = entry?.isIntersecting === true;
            syncPauseState();
          },
          { threshold: 0.08 },
        );
        intersectionObserver.observe(canvas);
        const updateVisibility = () => {
          isPageVisible = document.visibilityState === "visible";
          syncPauseState();
        };
        const updateReducedMotion = () => {
          if (reducedMotionQuery.matches) cancelCameraAnimation();
          world.animation.setReducedMotion(reducedMotionQuery.matches);
          upgrades.setReducedMotion(reducedMotionQuery.matches);
        };
        document.addEventListener("visibilitychange", updateVisibility);
        reducedMotionQuery.addEventListener("change", updateReducedMotion);
        syncPauseState();
        setEngineStatus("ready");

        cleanup = () => {
          resizeObserver.disconnect();
          intersectionObserver.disconnect();
          document.removeEventListener("visibilitychange", updateVisibility);
          reducedMotionQuery.removeEventListener("change", updateReducedMotion);
          runtime.dispose();
          runtimeRef.current = null;
        };
      } catch (error) {
        console.error("Terra World 3D engine could not start", error);
        if (!cancelled) setEngineStatus("failed");
      }
    }

    void mountEngine();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.upgrades.sync(houses, selectedHouseId);
  }, [houses, selectedHouseId]);

  useEffect(() => {
    const focusedHouseId = selectedHouseId ?? selectedNeighborhoodHouseId;
    if (focusedHouseId !== null) runtimeRef.current?.focusHouse(focusedHouseId);
  }, [selectedHouseId, selectedNeighborhoodHouseId]);

  const changeCamera = useCallback(
    (command: "left" | "right" | "closer" | "farther" | "home") => {
      const runtime = runtimeRef.current;
      if (runtime === null) return;
      runtime.cancelCameraAnimation();
      if (command === "home") {
        runtime.resetCamera();
        return;
      }
      if (command === "left") runtime.camera.alpha -= 0.24;
      if (command === "right") runtime.camera.alpha += 0.24;
      if (command === "closer")
        runtime.camera.radius = Math.max(
          runtime.camera.lowerRadiusLimit ?? 24,
          runtime.camera.radius - 10,
        );
      if (command === "farther")
        runtime.camera.radius = Math.min(
          runtime.camera.upperRadiusLimit ?? 132,
          runtime.camera.radius + 10,
        );
    },
    [],
  );

  const switchView = (mode: "town" | "walk") => {
    const runtime = runtimeRef.current;
    if (runtime === null) return;
    runtime.cancelCameraAnimation();
    if (mode === "walk") onWalkStart();
    runtime.walker.setActive(mode === "walk");
    setViewMode(mode);
  };

  const movementButton = (command: WalkCommand, label: string) => (
    <button
      key={command}
      type="button"
      className={`walk-${command}`}
      onPointerDown={(event) => {
        walkPressStartedRef.current = performance.now();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        runtimeRef.current?.walker.hold(command, true);
      }}
      onPointerUp={() => runtimeRef.current?.walker.hold(command, false)}
      onPointerCancel={() => runtimeRef.current?.walker.hold(command, false)}
      onLostPointerCapture={() =>
        runtimeRef.current?.walker.hold(command, false)
      }
      onClick={(event) => {
        if (
          event.detail === 0 ||
          performance.now() - walkPressStartedRef.current < 160
        )
          runtimeRef.current?.walker.nudge(command);
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`immersive-town-map${viewMode === "walk" ? " is-walking" : ""}`}
      data-time-of-day={timeOfDay}
    >
      <canvas
        aria-label={
          viewMode === "walk"
            ? "Walk around Rivergate. W A S D to move, arrow keys to move or turn, E to enter a nearby home. Drag to look."
            : "3D town view. Drag to turn, scroll to zoom."
        }
        tabIndex={0}
        ref={canvasRef}
      />
      {engineStatus === "loading" ? (
        <div className="immersive-town-status" role="status">
          <strong>Building your 3D town…</strong>
          <span>Planting gardens and starting the buses.</span>
        </div>
      ) : null}
      {engineStatus === "failed" ? (
        <div className="immersive-town-status is-error" role="alert">
          <strong>The 3D town needs graphics support.</strong>
          <span>You can still choose a home using the buttons below.</span>
        </div>
      ) : null}
      <div
        aria-label="Choose your view"
        className="town-view-switch"
        role="group"
      >
        <button
          aria-pressed={viewMode === "town"}
          disabled={engineStatus !== "ready"}
          onClick={() => switchView("town")}
          type="button"
        >
          Town view
        </button>
        <button
          aria-pressed={viewMode === "walk"}
          disabled={engineStatus !== "ready"}
          onClick={() => switchView("walk")}
          type="button"
        >
          Walk around
        </button>
      </div>
      {viewMode === "walk" ? (
        <>
          <div className="town-walk-help">
            <strong>You’re walking in Rivergate</strong>
            <span>Hold the buttons to walk. Drag the view to look.</span>
            <span className="walk-keyboard-hint">
              W A S D to move · arrows to turn · E to enter
            </span>
          </div>
          <div
            aria-label="Walking controls"
            className="town-walk-controls"
            role="group"
          >
            {movementButton("forward", "Forward")}
            {movementButton("left", "Turn left")}
            {movementButton("back", "Back")}
            {movementButton("right", "Turn right")}
          </div>
          <div className="town-walk-entry">
            <p aria-live="polite" role="status">
              {nearbyHouse === null
                ? "Walk up to a front door to visit."
                : nearbyHouse.displayName}
            </p>
            {nearbyHouse !== null ? (
              <button
                type="button"
                onClick={() => runtimeRef.current?.walker.enterHouse()}
              >
                Enter home
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div aria-label="3D camera controls" className="town-camera-controls">
          <button
            disabled={engineStatus !== "ready"}
            onClick={() => changeCamera("left")}
            type="button"
          >
            ↶ Turn left
          </button>
          <button
            disabled={engineStatus !== "ready"}
            onClick={() => changeCamera("right")}
            type="button"
          >
            Turn right ↷
          </button>
          <button
            disabled={engineStatus !== "ready"}
            onClick={() => changeCamera("closer")}
            type="button"
          >
            ＋ Closer
          </button>
          <button
            disabled={engineStatus !== "ready"}
            onClick={() => changeCamera("farther")}
            type="button"
          >
            − Wider
          </button>
          <button
            disabled={engineStatus !== "ready"}
            onClick={() => changeCamera("home")}
            type="button"
          >
            ⌂ Whole town
          </button>
        </div>
      )}
    </div>
  );
}

function isHouseId(value: string): value is HouseId {
  return value === "sunny" || value === "bluebell" || value === "mango";
}

function animateCamera(
  camera: ArcRotateCamera,
  target: Readonly<{
    alpha: number;
    beta: number;
    radius: number;
    target: Readonly<{ x: number; y: number; z: number }>;
  }>,
  tools: typeof import("../../lib/immersive-town/camera"),
  reducedMotion: boolean,
) {
  if (reducedMotion) {
    camera.alpha = target.alpha;
    camera.beta = target.beta;
    camera.radius = target.radius;
    camera.target.copyFromFloats(
      target.target.x,
      target.target.y,
      target.target.z,
    );
    return () => undefined;
  }
  const start = {
    alpha: camera.alpha,
    beta: camera.beta,
    radius: camera.radius,
    target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
  };
  const startedAt = performance.now();
  let animationFrame = 0;
  let cancelled = false;
  const tick = (now: number) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - startedAt) / 620);
    const pose = tools.interpolateCameraPose(start, target, progress);
    camera.alpha = pose.alpha;
    camera.beta = pose.beta;
    camera.radius = pose.radius;
    camera.target.copyFromFloats(pose.target.x, pose.target.y, pose.target.z);
    if (progress < 1) animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(animationFrame);
  };
}

export default memo(ImmersiveTownMap);

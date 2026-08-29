"use client";

import type { ArcRotateCamera } from "@babylonjs/core";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { HouseUpgradeVisuals } from "../../lib/immersive-town/house-upgrades-3d";
import type { ImmersiveTownWorld } from "../../lib/immersive-town/types";
import type { VehicleFleet } from "../../lib/immersive-town/vehicles-3d";
import type { HouseId, HouseUpgradeId } from "./HouseDiagnostics";

type ImmersiveTownMapProps = Readonly<{
  activeUpgradeId: HouseUpgradeId | null;
  houses: Readonly<Record<HouseId, readonly HouseUpgradeId[]>>;
  onHouseDrop: (houseId: HouseId, upgradeId: HouseUpgradeId) => void;
  onHouseSelect: (houseId: HouseId) => void;
  selectedHouseId: HouseId | null;
}>;

type RuntimeHandle = Readonly<{
  camera: ArcRotateCamera;
  upgrades: HouseUpgradeVisuals;
  vehicles: VehicleFleet;
  world: ImmersiveTownWorld;
  cancelCameraAnimation(): void;
  resetCamera(): void;
  focusHouse(houseId: HouseId): void;
  dispose(): void;
}>;

/**
 * Babylon.js owns the real 3D world, camera, lighting, picking and simulation.
 * React remains authoritative for learning state and the accessible house UI.
 */
function ImmersiveTownMap({
  activeUpgradeId,
  houses,
  onHouseDrop,
  onHouseSelect,
  selectedHouseId,
}: ImmersiveTownMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RuntimeHandle | null>(null);
  const propsRef = useRef({
    activeUpgradeId,
    houses,
    onHouseDrop,
    onHouseSelect,
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
        ] = await Promise.all([
          import("@babylonjs/core"),
          import("../../lib/immersive-town"),
          import("../../lib/immersive-town/camera"),
          import("../../lib/immersive-town/traffic"),
          import("../../lib/immersive-town/vehicles-3d"),
          import("../../lib/immersive-town/house-upgrades-3d"),
          import("../../lib/immersive-town/babylon-adapter"),
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
        const upgrades = upgradeTools.createHouseUpgradeVisuals(
          world.scene,
          world.houses,
        );
        let traffic = trafficTools.createTrafficSimulation();
        const vehicles = vehicleTools.createVehicleFleet(
          world.scene,
          traffic.vehicles.map((vehicle) => vehicle.id),
        );
        vehicles.sync(trafficTools.getVehicleTransforms(traffic), 0);
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
        let hoveredHouseId: HouseId | null = null;
        const setHoveredHouse = (houseId: HouseId | null) => {
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
            setHoveredHouse(
              hovered !== null && isHouseId(hovered.id) ? hovered.id : null,
            );
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
          if (house === null || !isHouseId(house.id)) return;
          const active = propsRef.current.activeUpgradeId;
          if (active === null) propsRef.current.onHouseSelect(house.id);
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
          const x =
            (event.clientX - bounds.left) *
            (engine.getRenderWidth() / bounds.width);
          const y =
            (event.clientY - bounds.top) *
            (engine.getRenderHeight() / bounds.height);
          const house = world.getHouseFromMesh(
            world.scene.pick(x, y)?.pickedMesh ?? null,
          );
          if (house !== null && isHouseId(house.id)) {
            propsRef.current.onHouseDrop(house.id, active);
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
        const focusHouse = (houseId: HouseId) => {
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
          cancelCameraAnimation: () => cancelCameraAnimation(),
          resetCamera,
          focusHouse,
          dispose() {
            cancelCameraAnimation();
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
        const syncPauseState = () => {
          const paused = !isOnscreen || !isPageVisible;
          world.animation.setPaused(paused);
          if (paused) engine.stopRenderLoop();
          else engine.runRenderLoop(() => world.render());
        };
        const intersectionObserver = new IntersectionObserver(([entry]) => {
          isOnscreen = entry?.isIntersecting === true;
          syncPauseState();
        }, { threshold: 0.08 });
        intersectionObserver.observe(canvas);
        const updateVisibility = () => {
          isPageVisible = document.visibilityState === "visible";
          syncPauseState();
        };
        const updateReducedMotion = () =>
          world.animation.setReducedMotion(reducedMotionQuery.matches);
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
    if (selectedHouseId !== null)
      runtimeRef.current?.focusHouse(selectedHouseId);
  }, [selectedHouseId]);

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

  return (
    <div className="immersive-town-map">
      <canvas aria-hidden="true" ref={canvasRef} />
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
    camera.target.copyFromFloats(target.target.x, target.target.y, target.target.z);
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

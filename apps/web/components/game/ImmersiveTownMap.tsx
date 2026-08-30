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
import type { NearbyConversation } from "../../lib/immersive-town/conversations-3d";
import type { HouseId, HouseUpgradeId } from "./HouseDiagnostics";
import "./TownWalking.css";
import BuildingVisit3D from "./BuildingVisit3D";
import type {
  BuildingTraversal,
  BuildingVisit,
  TraversalPhase,
} from "../../lib/immersive-town/building-traversal";
import {
  INTERIOR_ROOMS,
  type InteriorRoomId,
  type InteriorUpgradeId,
} from "../../lib/immersive-town/house-interior-world";
import type { TownVenue } from "../../lib/immersive-town/venue-catalog";
import { neighborhoodHomeProfile } from "../../lib/immersive-town/neighborhood-home-stories";
import { createAdaptiveResolution } from "../../lib/immersive-town/adaptive-performance";
import {
  getRenderBudget,
  parseRenderQuality,
  RENDER_QUALITY_STORAGE_KEY,
  sceneQualityForRenderBudget,
  shouldPauseTown,
  type RenderQualityPreference,
} from "../../lib/immersive-town/render-quality";

export type NeighborhoodHouseSelection = Readonly<{
  id: string;
  displayName: string;
}>;

type ImmersiveTownMapProps = Readonly<{
  timeOfDay: "day" | "night";
  activeUpgradeId: HouseUpgradeId | null;
  houses: Readonly<Record<HouseId, readonly HouseUpgradeId[]>>;
  neighborhoodHouses: Readonly<Record<string, readonly HouseUpgradeId[]>>;
  onSelectionConsumed(): void;
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
  traversal: BuildingTraversal;
  cancelCameraAnimation(): void;
  resetCamera(): void;
  focusHouse(houseId: string): void;
  setRenderPreference(preference: RenderQualityPreference): void;
  syncPauseState(): void;
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
  neighborhoodHouses,
  onSelectionConsumed,
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
  const [renderPreference, setRenderPreference] =
    useState<RenderQualityPreference>("auto");
  const [showFrameRate, setShowFrameRate] = useState(false);
  const [conversationsEnabled, setConversationsEnabled] = useState(true);
  const [nearbyConversation, setNearbyConversation] =
    useState<NearbyConversation | null>(null);
  const showFrameRateRef = useRef(false);
  showFrameRateRef.current = showFrameRate;
  const frameRateRef = useRef<HTMLOutputElement>(null);
  const [venue, setVenue] = useState<TownVenue | null>(null);
  const [visit, setVisit] = useState<BuildingVisit | null>(null);
  const [visitPhase, setVisitPhase] = useState<TraversalPhase>("outside");
  const [room, setRoom] = useState<InteriorRoomId | null>(null);
  const [indoorNearby, setIndoorNearby] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [requestedVisit, setRequestedVisit] = useState<string | null>(null);
  const [nearExit, setNearExit] = useState(false);
  const [indoorActivity, setIndoorActivity] = useState<{
    name: string;
    role: string;
    text: string;
  } | null>(null);
  const floorSelectRef = useRef<HTMLSelectElement>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [allHomes, setAllHomes] = useState<NeighborhoodHouseSelection[]>([]);
  const [nearbyVenue, setNearbyVenue] = useState<TownVenue | null>(null);
  const visitOpenRef = useRef(false);
  visitOpenRef.current = venue !== null || directoryOpen;
  const renderingBlockedRef = useRef(false);
  renderingBlockedRef.current = visitOpenRef.current;
  useEffect(() => {
    runtimeRef.current?.syncPauseState();
  }, [
    venue,
    directoryOpen,
    selectedHouseId,
    selectedNeighborhoodHouseId,
    visitPhase,
  ]);
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
    neighborhoodHouses,
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
    neighborhoodHouses,
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
          traversalTools,
        ] = await Promise.all([
          import("../../lib/immersive-town/babylon-runtime"),
          import("../../lib/immersive-town"),
          import("../../lib/immersive-town/camera"),
          import("../../lib/immersive-town/traffic"),
          import("../../lib/immersive-town/vehicles-3d"),
          import("../../lib/immersive-town/house-upgrades-3d"),
          import("../../lib/immersive-town/babylon-adapter"),
          import("../../lib/immersive-town/town-walker"),
          import("../../lib/immersive-town/building-traversal"),
        ]);
        if (cancelled) return;

        const reducedMotionQuery = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        );
        const engine = new Babylon.Engine(
          canvas,
          false,
          {
            antialias: false,
            audioEngine: false,
            preserveDrawingBuffer: false,
            powerPreference: "default",
            stencil: true,
          },
          false,
        );
        let preference: RenderQualityPreference = "auto";
        try {
          preference = parseRenderQuality(
            localStorage.getItem(RENDER_QUALITY_STORAGE_KEY),
          );
        } catch {
          // Private browsing/storage restrictions must not prevent entry.
        }
        setRenderPreference(preference);
        const readBudget = () =>
          getRenderBudget(
            preference,
            window.devicePixelRatio,
            canvas.clientWidth,
            canvas.clientHeight,
          );
        const resolution = createAdaptiveResolution(readBudget());
        engine.setHardwareScalingLevel(1 / resolution.pixelRatio);

        const world = town.createImmersiveTownWorld(engine, {
          attachCameraControls: true,
          quality: sceneQualityForRenderBudget(
            preference,
            resolution.pixelRatio,
          ),
          reducedMotion: reducedMotionQuery.matches,
        });
        const instrumentation = new Babylon.SceneInstrumentation(world.scene);
        const applyResolution = () => {
          engine.setHardwareScalingLevel(1 / resolution.pixelRatio);
          world.setRenderQuality(
            sceneQualityForRenderBudget(preference, resolution.pixelRatio),
          );
        };
        adapterTools.configureKidFriendlyCamera(world.camera);
        const walker = walkingTools.createTownWalker(world, canvas, {
          isBlocked: () =>
            visitOpenRef.current ||
            (traversal !== undefined && traversal.phase !== "outside") ||
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
            traversal?.open(house.id);
          },
          onNearbyVenue: (place) => setNearbyVenue(place?.venue ?? null),
          onEnterVenue: (place) => traversal?.open(place.venue.id),
        });
        const traversal = traversalTools.createBuildingTraversal(
          world,
          walker,
          {
            isBlocked: () =>
              visitOpenRef.current ||
              document.visibilityState !== "visible" ||
              canvas.closest("[inert]") !== null ||
              document.querySelector("dialog[open]") !== null,
            reducedMotion: () => reducedMotionQuery.matches,
            upgrades: (id) =>
              (isHouseId(id)
                ? propsRef.current.houses[id]
                : (propsRef.current.neighborhoodHouses[id] ?? [])
              ).filter((u): u is InteriorUpgradeId =>
                ["light", "water", "garden", "recycle"].includes(u),
              ),
            onRepair: (id, upgrade) => {
              if (isHouseId(id)) propsRef.current.onHouseDrop(id, upgrade);
              else
                propsRef.current.onNeighborhoodHouseDrop(
                  {
                    id,
                    displayName:
                      world.houses.find((h) => h.id === id)?.displayName ?? id,
                  },
                  upgrade,
                );
            },
            onChange: (next, phase) => {
              setVisit(next);
              setVisitPhase(phase);
              setEntryError(null);
              setViewMode("walk");
              setNearbyConversation(null);
            },
            onRoom: setRoom,
            onNearby: setIndoorNearby,
            onError: setEntryError,
            onLift: () => floorSelectRef.current?.focus(),
          },
        );
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
        world.residents.setTraffic(traffic);
        world.setTimeOfDay(timeOfDayRef.current);
        vehicles.setNight(timeOfDayRef.current === "night");
        upgrades.sync(
          propsRef.current.houses,
          propsRef.current.selectedHouseId,
        );

        let lastConversationKey = "";
        const unsubscribeAnimation = world.animation.subscribe((frame) => {
          const nearby = world.conversations.current;
          const key = nearby ? `${nearby.speaker}:${nearby.text}` : "";
          if (key !== lastConversationKey) {
            lastConversationKey = key;
            setNearbyConversation(nearby);
          }
          traffic = trafficTools.stepTraffic(traffic, frame.deltaSeconds, {
            reducedMotion: frame.reducedMotion,
            stops: world.residents.trafficStops,
          });
          world.residents.setTraffic(traffic);
          vehicles.setBoardingDoors(world.residents.boardingVehicles);
          vehicles.sync(
            trafficTools.getVehicleTransforms(traffic),
            traffic.elapsedSeconds,
          );
        });

        let cancelCameraAnimation: () => void = () => undefined;
        let hoveredHouseId: string | null = null;
        const setHoveredHouse = (houseId: string | null) => {
          if (houseId === hoveredHouseId) return;
          const affectedHouses = [hoveredHouseId, houseId];
          affectedHouses.forEach((id) => {
            const house = world.houses.find((candidate) => candidate.id === id);
            if (!house) return;
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
            if (world.getVenueFromMesh(pointer.pickInfo?.pickedMesh ?? null))
              canvas.style.cursor = "pointer";
            return;
          }
          if (pointer.type === Babylon.PointerEventTypes.POINTERDOWN) {
            cancelCameraAnimation();
            return;
          }
          if (pointer.type !== Babylon.PointerEventTypes.POINTERPICK) return;
          if (
            visitOpenRef.current ||
            traversal?.phase !== "outside" ||
            propsRef.current.activeUpgradeId !== null
          )
            return;
          const destination = world.getVenueFromMesh(
            pointer.pickInfo?.pickedMesh ?? null,
          );
          if (destination) {
            if (walker.active) walker.enterVenue(destination.venue.id);
            else traversal?.open(destination.venue.id);
            return;
          }
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
          traversal?.open(house.id);
        });

        const dropUpgradeOnHouse = (event: PointerEvent) => {
          if (visitOpenRef.current || traversal?.phase !== "outside") return;
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
          traversal,
          cancelCameraAnimation: () => cancelCameraAnimation(),
          resetCamera,
          focusHouse,
          setRenderPreference(nextPreference) {
            preference = nextPreference;
            resolution.reset(readBudget());
            applyResolution();
          },
          syncPauseState: () => syncPauseState(),
          dispose() {
            cancelCameraAnimation();
            traversal?.dispose();
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
            instrumentation.dispose();
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
        setAllHomes(
          world.houses.map((house) => ({
            id: house.id,
            displayName: house.displayName,
          })),
        );

        let viewport = "";
        const resizeObserver = new ResizeObserver(() => {
          const nextViewport = `${canvas.clientWidth}:${canvas.clientHeight}:${window.devicePixelRatio}`;
          if (nextViewport === viewport) return;
          viewport = nextViewport;
          resolution.reset(readBudget());
          applyResolution();
          world.resize();
        });
        resizeObserver.observe(canvas);
        let isOnscreen = true;
        let isPageVisible = document.visibilityState === "visible";
        let isRendering = false;
        let lastFrameAt = 0;
        let measuredMs = 0;
        let measuredFrames = 0;
        let measuredDrawCalls = 0;
        let previousNearExit = false;
        let previousIndoorActivity = "";
        const resetMeasurements = () => {
          lastFrameAt = 0;
          measuredMs = 0;
          measuredFrames = 0;
          measuredDrawCalls = 0;
          resolution.reset();
        };
        const renderFrame = () => {
          const now = performance.now();
          const frameMs = lastFrameAt > 0 ? now - lastFrameAt : 0;
          lastFrameAt = now;
          if (frameMs > 0 && resolution.sample(frameMs) !== null)
            applyResolution();
          traversal?.update(frameMs / 1000);
          if (traversal?.inside) traversal.scene.render();
          else world.render();
          if (traversal?.nearExit !== previousNearExit) {
            previousNearExit = traversal?.nearExit ?? false;
            setNearExit(previousNearExit);
          }
          const activity = traversal?.nearbyActivity ?? null;
          const activityKey = activity
            ? `${activity.name}:${activity.text}`
            : "";
          if (activityKey !== previousIndoorActivity) {
            previousIndoorActivity = activityKey;
            setIndoorActivity(activity);
          }
          if (showFrameRateRef.current && frameMs > 0 && frameMs <= 1000) {
            measuredMs += frameMs;
            measuredFrames += 1;
            measuredDrawCalls += instrumentation.drawCallsCounter.current;
            if (measuredMs >= 1000 && frameRateRef.current) {
              const fps = Math.round((measuredFrames * 1000) / measuredMs);
              const quality =
                sceneQualityForRenderBudget(
                  preference,
                  resolution.pixelRatio,
                ) === "low"
                  ? "Performance"
                  : "Balanced";
              frameRateRef.current.textContent = `${fps} FPS · ${quality} · ${Math.round(resolution.pixelRatio * 100)}% resolution · ${world.scene.getActiveMeshes().length}/${world.scene.meshes.length} active meshes · ${Math.round(measuredDrawCalls / measuredFrames)} draw calls/frame`;
              measuredMs = 0;
              measuredFrames = 0;
              measuredDrawCalls = 0;
            }
          } else {
            measuredMs = 0;
            measuredFrames = 0;
            measuredDrawCalls = 0;
          }
        };
        const syncPauseState = () => {
          const paused = shouldPauseTown(
            isPageVisible,
            isOnscreen,
            renderingBlockedRef.current,
          );
          if (paused) {
            walker.clearInput();
            traversal?.walker.clearInput();
          }
          world.animation.setPaused(paused || traversal?.inside === true);
          if (paused && isRendering) {
            engine.stopRenderLoop(renderFrame);
            isRendering = false;
            resetMeasurements();
            if (frameRateRef.current)
              frameRateRef.current.textContent = "City rendering paused";
          } else if (!paused && !isRendering) {
            resetMeasurements();
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
    runtimeRef.current?.traversal.syncUpgrades();
  }, [houses, neighborhoodHouses, selectedHouseId]);

  useEffect(() => {
    if (directoryOpen || !requestedVisit || engineStatus !== "ready") return;
    // The directory dialog must unmount before it hands input back to the game.
    runtimeRef.current?.walker.setActive(false);
    runtimeRef.current?.traversal.open(requestedVisit);
    setRequestedVisit(null);
  }, [requestedVisit, directoryOpen, engineStatus]);

  useEffect(() => {
    const focusedHouseId = selectedHouseId ?? selectedNeighborhoodHouseId;
    if (focusedHouseId !== null && engineStatus === "ready") {
      onWalkStart();
      runtimeRef.current?.cancelCameraAnimation();
      const traversal = runtimeRef.current?.traversal;
      if (traversal?.visit?.id !== focusedHouseId) {
        if (
          runtimeRef.current?.walker.active &&
          traversal?.phase === "outside"
        ) {
          setEntryError("Walk up to this home's front door to enter.");
        }
        traversal?.open(focusedHouseId);
      }
      onSelectionConsumed();
    }
  }, [
    selectedHouseId,
    selectedNeighborhoodHouseId,
    engineStatus,
    onSelectionConsumed,
    onWalkStart,
  ]);

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
    if (runtime.traversal.phase !== "outside") return;
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
        runtimeRef.current?.traversal.hold(command, true);
      }}
      onPointerUp={() => runtimeRef.current?.traversal.hold(command, false)}
      onPointerCancel={() => runtimeRef.current?.traversal.hold(command, false)}
      onLostPointerCapture={() =>
        runtimeRef.current?.traversal.hold(command, false)
      }
      onClick={(event) => {
        if (
          event.detail === 0 ||
          performance.now() - walkPressStartedRef.current < 160
        )
          runtimeRef.current?.traversal.nudge(command);
      }}
    >
      {label}
    </button>
  );

  const activeRoom = INTERIOR_ROOMS.find((r) => r.id === room);
  const apartment =
    visit?.venue?.kind === "apartments"
      ? neighborhoodHomeProfile(visit.id)
      : null;
  const installed = visit
    ? isHouseId(visit.id)
      ? houses[visit.id]
      : (neighborhoodHouses[visit.id] ?? [])
    : [];
  const repairUpgrade =
    indoorNearby === "repair"
      ? apartment?.need
      : visit?.kind === "home" && indoorNearby === room
        ? activeRoom?.upgradeId
        : undefined;
  const needsRepair =
    repairUpgrade !== undefined && !installed.includes(repairUpgrade);
  const repairLabels: Record<InteriorUpgradeId, string> = {
    light: "Restore power",
    water: "Repair water supply",
    garden: "Restore garden",
    recycle: "Set up recycling",
  };

  return (
    <div
      className={`immersive-town-map${viewMode === "walk" ? " is-walking" : ""}${visit ? " is-inside-building" : ""}`}
      data-time-of-day={timeOfDay}
      data-visit-phase={visitPhase}
    >
      <canvas
        aria-label={
          visit
            ? `Inside ${visit.name}. W A S D to walk, arrows to turn. Walk back through the front door to leave.`
            : viewMode === "walk"
              ? "Walk around Rivergate. W A S D to move, arrow keys to move or turn, E to enter a nearby building. Drag to look."
              : "3D town view. Drag to turn, scroll to zoom."
        }
        tabIndex={0}
        ref={canvasRef}
      />
      {entryError ? (
        <p className="building-entry-error" role="alert">
          {entryError}
        </p>
      ) : null}
      {visit ? (
        <div className="building-visit-hud" aria-label="Current building">
          <strong>{visit.name}</strong>
          <span aria-live="polite">
            {visitPhase === "opening"
              ? "Opening the door…"
              : visitPhase === "entering"
                ? "Walking inside…"
                : visitPhase === "leaving" || visitPhase === "emerging"
                  ? "Walking outside…"
                  : room
                    ? INTERIOR_ROOMS.find((r) => r.id === room)?.label
                    : visit.venue?.floors[visit.floor]?.label}
          </span>
          {visit.venue && visit.venue.floors.length > 1 ? (
            <label>
              Lift
              <select
                ref={floorSelectRef}
                aria-label="Choose building floor"
                value={visit.floor}
                disabled={indoorNearby !== "lift" || visitPhase !== "inside"}
                onChange={(e) => {
                  runtimeRef.current?.traversal.changeFloor(
                    Number(e.target.value),
                  );
                  canvasRef.current?.focus({ preventScroll: true });
                }}
              >
                {visit.venue.floors.map((floor, i) => (
                  <option key={i} value={i}>
                    {floor.label}
                  </option>
                ))}
              </select>
              {indoorNearby !== "lift" ? (
                <small>Walk to the lift at the back.</small>
              ) : null}
            </label>
          ) : null}
        </div>
      ) : null}
      {!visit ? (
        <>
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
            <button
              type="button"
              disabled={engineStatus !== "ready"}
              onClick={() => {
                onWalkStart();
                runtimeRef.current?.walker.clearInput();
                setDirectoryOpen(true);
              }}
            >
              Places
            </button>
          </div>
          <details className="town-render-settings">
            <summary>Graphics</summary>
            <label>
              Render quality
              <select
                aria-label="Render quality"
                disabled={engineStatus !== "ready"}
                value={renderPreference}
                onChange={(event) => {
                  const preference = parseRenderQuality(event.target.value);
                  setRenderPreference(preference);
                  runtimeRef.current?.setRenderPreference(preference);
                  try {
                    localStorage.setItem(
                      RENDER_QUALITY_STORAGE_KEY,
                      preference,
                    );
                  } catch {
                    // Keep the preference for this session when storage is unavailable.
                  }
                }}
              >
                <option value="auto">Auto</option>
                <option value="performance">Performance</option>
                <option value="balanced">Balanced</option>
              </select>
            </label>
            <p>
              {renderPreference === "auto"
                ? "Adjusts resolution to frame time. The whole city stays available."
                : renderPreference === "performance"
                  ? "Lower resolution and no dynamic shadows. All places and people remain."
                  : "Sharper detail and light shadows, with a bounded resolution."}
            </p>
            <label className="town-frame-rate-toggle">
              <input
                type="checkbox"
                checked={conversationsEnabled}
                disabled={engineStatus !== "ready"}
                onChange={(event) => {
                  setConversationsEnabled(event.target.checked);
                  runtimeRef.current?.world.conversations.setEnabled(
                    event.target.checked,
                  );
                  if (!event.target.checked) setNearbyConversation(null);
                }}
              />
              Resident conversations
            </label>
            <p className="town-conversation-transcript" aria-live="off">
              {nearbyConversation
                ? `${nearbyConversation.name}, ${nearbyConversation.place}: ${nearbyConversation.text}`
                : "Nearby residents chat as you explore. Conversations are written local dialogue, with no microphone or network access."}
            </p>
            <label className="town-frame-rate-toggle">
              <input
                type="checkbox"
                checked={showFrameRate}
                onChange={(event) => setShowFrameRate(event.target.checked)}
              />
              Show frame rate
            </label>
            <output ref={frameRateRef} hidden={!showFrameRate} aria-live="off">
              Measuring city frames…
            </output>
          </details>
        </>
      ) : null}
      {viewMode === "walk" ? (
        <>
          <div className="town-walk-help">
            <strong>
              {visit ? "Explore inside" : "You’re walking in Rivergate"}
            </strong>
            <span>
              {visit
                ? "Walk through the rooms. Return through the front door."
                : "Hold the buttons to walk. Drag the view to look."}
            </span>
            <span className="walk-keyboard-hint">
              W A S D to move · arrows to turn · E to interact
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
              {visit
                ? nearExit
                  ? "Front door · back to Rivergate"
                  : indoorNearby === "exit" && visit.floor > 0
                    ? "Take the lift to the ground floor to leave the building."
                    : indoorNearby === "lift"
                      ? "Lift · choose a floor above."
                      : indoorNearby === "repair" && apartment
                        ? needsRepair
                          ? apartment.problem
                          : apartment.healthy
                        : indoorNearby && activeRoom
                          ? installed.includes(activeRoom.upgradeId)
                            ? activeRoom.healthy
                            : activeRoom.problem
                          : indoorActivity && conversationsEnabled
                            ? `${indoorActivity.name} · ${indoorActivity.role}: “${indoorActivity.text}”`
                            : apartment && visit.floor === 0
                              ? "Resident repairs · walk to the reception desk."
                              : "Explore the rooms. Approach an object to interact."
                : (nearbyVenue?.name ??
                  nearbyHouse?.displayName ??
                  "Walk up to a front door to visit.")}
            </p>
            {visit ? (
              visitPhase === "inside" &&
              (nearExit ||
                indoorNearby === "lift" ||
                indoorNearby === "exit" ||
                needsRepair) ? (
                <button
                  type="button"
                  onClick={() => runtimeRef.current?.traversal.interact()}
                >
                  {nearExit
                    ? "Walk outside"
                    : indoorNearby === "lift"
                      ? "Use lift"
                      : indoorNearby === "exit"
                        ? "Check exit"
                        : repairUpgrade
                          ? repairLabels[repairUpgrade]
                          : "Interact"}
                </button>
              ) : null
            ) : nearbyHouse !== null || nearbyVenue !== null ? (
              <button
                type="button"
                onClick={() => runtimeRef.current?.walker.enterNearby()}
              >
                {nearbyVenue?.outdoor
                  ? "Visit this place"
                  : nearbyVenue
                    ? "Enter building"
                    : "Enter home"}
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
      {venue !== null || directoryOpen ? (
        <BuildingVisit3D
          key={venue?.id ?? "directory"}
          venue={venue}
          timeOfDay={timeOfDay}
          homes={allHomes}
          onVisit={(place) => {
            visitOpenRef.current = false;
            setDirectoryOpen(false);
            setRequestedVisit(place.id);
          }}
          onHome={(home) => {
            setVenue(null);
            setDirectoryOpen(false);
            visitOpenRef.current = false;
            setRequestedVisit(home.id);
          }}
          onClose={() => {
            setVenue(null);
            setDirectoryOpen(false);
            canvasRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
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

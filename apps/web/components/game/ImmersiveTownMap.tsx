"use client";

import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import OpeningChapter from "./OpeningChapter";
import MissionMinimap from "./MissionMinimap";
import LeoSpeechBubble from "./LeoSpeechBubble";
import { createLeoReplyLifetime } from "../../lib/immersive-town/leo-reply-lifetime";
import {
  buildMissionMapGeometry,
  EAST_BRIDGE_MAP_POSITION,
  type MissionMapBuilding,
  type MissionMapGeometry,
  type MissionMapPose,
} from "../../lib/immersive-town/mission-minimap";
import {
  resolveMissionMapGuide,
  type RepairMapMission,
} from "../../lib/immersive-town/mission-map-guide";
import {
  CHAPTER_INTRO,
  createChapterState,
  reduceChapter,
  type ChapterState,
  type ChapterEvent,
  type ChapterEvidenceId,
} from "../../lib/opening-chapter/story";
import {
  readChapterSave,
  writeChapterSave,
} from "../../lib/opening-chapter/persistence";
import type { OpeningChapterWorld } from "../../lib/immersive-town/opening-chapter-world";

import type { HouseUpgradeVisuals } from "../../lib/immersive-town/house-upgrades-3d";
import type { ImmersiveTownWorld } from "../../lib/immersive-town/types";
import type {
  TownWalker,
  WalkCommand,
} from "../../lib/immersive-town/town-walker";
import type { VehicleFleet } from "../../lib/immersive-town/vehicles-3d";
import {
  partyLoadMessage,
  type PartyModelStatus,
} from "../../lib/immersive-town/party-status";
import type { NearbyConversation } from "../../lib/immersive-town/conversations-3d";
import {
  HOUSE_PROFILES,
  type HouseId,
  type HouseUpgradeId,
} from "./HouseDiagnostics";
import "./TownWalking.css";
import "./OpeningChapterWorld.css";
import "./MissionMinimapPlacement.css";
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
  leoReply?: Readonly<{ id: string; text: string }> | undefined;
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
  onResidentTalk?: (houseId: string) => void;
  onHomeInspected?: (houseId: string) => void;
  residentJournalOpen?: boolean;
  speechBlocked?: boolean;
  onChapterActiveChange?: (active: boolean) => void;
  repairMapMission?: RepairMapMission | null;
  missionMapStatus?: string;
}>;

type RuntimeHandle = Readonly<{
  camera: ArcRotateCamera;
  upgrades: HouseUpgradeVisuals;
  vehicles: VehicleFleet;
  world: ImmersiveTownWorld;
  walker: TownWalker;
  traversal: BuildingTraversal;
  chapter: OpeningChapterWorld;
  syncChapter(state: ChapterState | null): void;
  travelToChapterPoint(id: ChapterEvidenceId): void;
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
  leoReply,
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
  onResidentTalk,
  onHomeInspected,
  residentJournalOpen = false,
  speechBlocked = false,
  onChapterActiveChange,
  repairMapMission = null,
  missionMapStatus = "Explore Rivergate and visit your neighbours.",
}: ImmersiveTownMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leoBubbleRef = useRef<HTMLDivElement>(null);
  const [leoReplyLifetime] = useState(createLeoReplyLifetime);
  const [dismissedLeoReply, setDismissedLeoReply] = useState<string | null>(
    null,
  );
  const [leoModelState, setLeoModelState] =
    useState<PartyModelStatus>("loading");
  const runtimeRef = useRef<RuntimeHandle | null>(null);
  const [mapGeometry, setMapGeometry] = useState<MissionMapGeometry | null>(
    null,
  );
  const [chapter, setChapter] = useState<ChapterState | null>(null);
  const [savedChapter, setSavedChapter] = useState<ChapterState | null>(null);
  const [chapterVisible, setChapterVisible] = useState(true);
  const [chapterReading, setChapterReading] = useState(false);
  const [chapterSaveFailed, setChapterSaveFailed] = useState(false);
  const [chapterLeoReply, setChapterLeoReply] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [nearbyChapterPoint, setNearbyChapterPoint] =
    useState<ChapterEvidenceId | null>(null);
  const chapterRef = useRef<ChapterState | null>(null);
  const chapterReadingRef = useRef(false);
  chapterRef.current = chapter;
  chapterReadingRef.current = chapterReading || chapter?.phase === "intro";
  useEffect(() => {
    setSavedChapter(readChapterSave());
  }, []);
  useEffect(() => {
    onChapterActiveChange?.(chapter !== null);
  }, [chapter !== null, onChapterActiveChange]);
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
  const journalOpenRef = useRef(residentJournalOpen);
  journalOpenRef.current = residentJournalOpen;
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
  const [viewMode, setViewMode] = useState<"town" | "walk">("town");
  const [running, setRunning] = useState(false);
  const [nearbyHouse, setNearbyHouse] =
    useState<NeighborhoodHouseSelection | null>(null);
  const propsRef = useRef({
    activeUpgradeId,
    houses,
    neighborhoodHouses,
    onHouseDrop,
    onHouseSelect,
    onHomeInspected,
    onNeighborhoodHouseDrop,
    onNeighborhoodHouseSelect,
    selectedNeighborhoodHouseId,
    selectedHouseId,
  });
  const [engineStatus, setEngineStatus] = useState<
    "loading" | "ready" | "failed"
  >("loading");

  // The minimap samples this stable callback locally, not through a React
  // update of the entire city for each footstep. Interiors have separate scene
  // coordinates: keep the street marker at the actual building entrance.
  const readMapPose = useCallback((): MissionMapPose | null => {
    const runtime = runtimeRef.current;
    if (!runtime) return null;
    const currentVisit = runtime.traversal.visit;
    const entrance = currentVisit
      ? [...runtime.walker.doors, ...runtime.walker.venueDoors].find(
          (door) => door.id === currentVisit.id,
        )
      : null;
    const position = entrance ?? runtime.walker.camera.position;
    return {
      x: position.x,
      z: position.z,
      yaw: runtime.walker.camera.rotation.y,
    };
  }, []);

  const mapGuide = useMemo(() => {
    const runtime = runtimeRef.current;
    return resolveMissionMapGuide({
      chapter,
      chapterPoints: runtime?.chapter.points ?? [],
      repairMission: repairMapMission,
      houseDoors: runtime?.walker.doors ?? [],
      freeExploreStatus: missionMapStatus,
      visit,
    });
  }, [chapter, engineStatus, repairMapMission, missionMapStatus, visit]);

  useEffect(() => {
    runtimeRef.current?.syncChapter(chapter);
    setChapterLeoReply(null);
    if (chapter) {
      setSavedChapter(chapter);
      setChapterSaveFailed(!writeChapterSave(chapter));
    }
  }, [chapter, engineStatus]);

  const chapterEvent = useCallback((event: ChapterEvent) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (event.type === "collect-evidence" || event.type === "observe") {
      const id = event.type === "observe" ? "bridge" : event.id;
      const point = runtime.chapter.points.find((item) => item.id === id);
      const pose = runtime.walker.camera.position;
      if (
        !point ||
        !runtime.walker.active ||
        runtime.traversal.phase !== "outside" ||
        Math.hypot(pose.x - point.position.x, pose.z - point.position.z) >
          point.radius
      )
        return;
    }
    setChapter((current) =>
      current ? reduceChapter(current, event) : current,
    );
  }, []);

  const travelToChapterPoint = useCallback((id: ChapterEvidenceId) => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.traversal.phase !== "outside") return;
    runtime.travelToChapterPoint(id);
    setViewMode("walk");
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!residentJournalOpen || !runtime) return;
    runtime.walker.clearInput();
    runtime.traversal.walker.clearInput();
    runtime.cancelCameraAnimation();
    // Reading blocks player input, not traffic, residents or rendering.
    runtime.camera.detachControl();
    return () => {
      if (
        runtimeRef.current === runtime &&
        !runtime.walker.active &&
        runtime.traversal.phase === "outside"
      ) {
        runtime.camera.attachControl(canvasRef.current, true);
      }
    };
  }, [residentJournalOpen, engineStatus]);

  propsRef.current = {
    activeUpgradeId,
    houses,
    neighborhoodHouses,
    onHouseDrop,
    onHouseSelect,
    onHomeInspected,
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
          partyTools,
          chapterTools,
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
          import("../../lib/immersive-town/walking-party"),
          import("../../lib/immersive-town/opening-chapter-world"),
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
        let appliedPixelRatio = resolution.pixelRatio;

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
          const resized = appliedPixelRatio !== resolution.pixelRatio;
          if (resized) {
            appliedPixelRatio = resolution.pixelRatio;
            // Changing Babylon's hardware scale already resizes its buffers.
            engine.setHardwareScalingLevel(1 / resolution.pixelRatio);
          }
          world.setRenderQuality(
            sceneQualityForRenderBudget(preference, resolution.pixelRatio),
          );
          return resized;
        };
        adapterTools.configureKidFriendlyCamera(world.camera);
        const walker = walkingTools.createTownWalker(world, canvas, {
          isBlocked: () =>
            visitOpenRef.current ||
            journalOpenRef.current ||
            chapterReadingRef.current ||
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
              journalOpenRef.current ||
              chapterReadingRef.current ||
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
              // Credit an inspection only after crossing the actual door,
              // never from a journal selection or a distant building click.
              if (
                next &&
                phase === "inside" &&
                world.houses.some((house) => house.id === next.id)
              ) {
                propsRef.current.onHomeInspected?.(next.id);
              }
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
        const chapterWorld = chapterTools.createOpeningChapterWorld(world);
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
            stops: [
              ...world.residents.trafficStops,
              ...chapterWorld.trafficStops,
            ],
          });
          traffic = chapterWorld.routeTraffic(traffic);
          world.residents.setTraffic(traffic);
          vehicles.setBoardingDoors(world.residents.boardingVehicles);
          vehicles.sync(
            chapterWorld.getVehicleTransforms(traffic),
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
            journalOpenRef.current ||
            chapterReadingRef.current ||
            traversal?.phase !== "outside" ||
            propsRef.current.activeUpgradeId !== null
          )
            return;
          const chapterPoint =
            pointer.pickInfo?.pickedMesh?.metadata?.chapterPointId;
          if (
            chapterRef.current &&
            ["bridge", "maya", "malik", "nia"].includes(chapterPoint)
          ) {
            travelToChapterPoint(chapterPoint as ChapterEvidenceId);
            return;
          }
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
          if (
            visitOpenRef.current ||
            journalOpenRef.current ||
            traversal?.phase !== "outside"
          )
            return;
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
          chapter: chapterWorld,
          travelToChapterPoint(id) {
            const point = chapterWorld.points.find((item) => item.id === id);
            if (!point || traversal.phase !== "outside") return;
            cancelCameraAnimation();
            chapterWorld.clearShot();
            walker.setActive(true);
            walker.clearInput();
            walker.camera.position.copyFrom(point.approach);
            walker.camera.position.y =
              walker.groundHeight(point.approach) + 1.72;
            walker.camera.rotation.set(
              0.06,
              Math.atan2(
                point.position.x - point.approach.x,
                point.position.z - point.approach.z,
              ),
              0,
            );
            canvas.focus({ preventScroll: true });
          },
          syncChapter(next) {
            const wasActive = chapterWorld.active;
            chapterWorld.setStage(
              next?.decision ?? "closed",
              next?.outcomeObserved ?? false,
            );
            chapterWorld.setActive(next !== null);
            if (next && !wasActive) {
              traffic = chapterWorld.prepareTraffic(traffic);
              world.residents.setTraffic(traffic);
              vehicles.sync(
                chapterWorld.getVehicleTransforms(traffic),
                traffic.elapsedSeconds,
              );
            }
            if (next?.phase === "intro") {
              cancelCameraAnimation();
              walker.setActive(false);
              walker.clearInput();
              chapterWorld.setShot(
                CHAPTER_INTRO[next.introIndex]!.shot,
                reducedMotionQuery.matches,
              );
              setViewMode("town");
            } else {
              chapterWorld.clearShot();
              if (next && (!wasActive || !walker.active)) {
                runtime.travelToChapterPoint("bridge");
                setViewMode("walk");
              }
            }
          },
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
            chapterWorld.dispose();
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
        const footprint = (
          id: string,
          meshes: readonly import("@babylonjs/core/Meshes/abstractMesh").AbstractMesh[],
        ): MissionMapBuilding => {
          let minX = Infinity,
            maxX = -Infinity,
            minZ = Infinity,
            maxZ = -Infinity;
          for (const mesh of meshes) {
            mesh.computeWorldMatrix(true);
            const bounds = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bounds.minimumWorld.x);
            maxX = Math.max(maxX, bounds.maximumWorld.x);
            minZ = Math.min(minZ, bounds.minimumWorld.z);
            maxZ = Math.max(maxZ, bounds.maximumWorld.z);
          }
          return {
            id,
            position: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
            width: maxX - minX,
            depth: maxZ - minZ,
          };
        };
        setMapGeometry(
          buildMissionMapGeometry({
            homes: world.houses.map((house) =>
              footprint(`home:${house.id}`, [house.pickMesh]),
            ),
            venues: world.venues
              .filter(({ venue }) => !venue.outdoor)
              .map(({ venue, meshes }) =>
                footprint(`venue:${venue.id}`, meshes),
              ),
          }),
        );
        setAllHomes(
          world.houses.map((house) => ({
            id: house.id,
            displayName: house.displayName,
          })),
        );

        let viewport = `${canvas.clientWidth}:${canvas.clientHeight}:${window.devicePixelRatio}`;
        const resizeObserver = new ResizeObserver(() => {
          const nextViewport = `${canvas.clientWidth}:${canvas.clientHeight}:${window.devicePixelRatio}`;
          if (nextViewport === viewport) return;
          viewport = nextViewport;
          resolution.reset(readBudget());
          if (!applyResolution()) world.resize();
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
        let previousLeoState = "";
        let previousRunning = false;
        let previousChapterPoint: ChapterEvidenceId | null = null;
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
          chapterWorld.update(frameMs / 1000);
          const nextChapterPoint =
            chapterWorld.active &&
            walker.active &&
            traversal.phase === "outside"
              ? (chapterWorld.points.find(
                  (point) =>
                    Math.hypot(
                      walker.camera.position.x - point.position.x,
                      walker.camera.position.z - point.position.z,
                    ) <= point.radius,
                )?.id ?? null)
              : null;
          if (nextChapterPoint !== previousChapterPoint) {
            previousChapterPoint = nextChapterPoint;
            setNearbyChapterPoint(nextChapterPoint);
          }
          if (traversal?.inside) traversal.scene.render();
          else world.render();
          const isRunning = traversal.walker.running;
          if (isRunning !== previousRunning) {
            previousRunning = isRunning;
            setRunning(isRunning);
          }
          const party = partyTools.walkingPartyFor(traversal.scene);
          if (party && party.modelState !== previousLeoState) {
            previousLeoState = party.modelState;
            setLeoModelState(party.modelState);
          }
          const bubble = leoBubbleRef.current;
          if (bubble) {
            const projected = party?.project(
              canvas.clientWidth,
              canvas.clientHeight,
            );
            const visible =
              projected &&
              projected.x > 0 &&
              projected.x < canvas.clientWidth &&
              projected.y > 0 &&
              projected.y < canvas.clientHeight;
            bubble.style.visibility = visible ? "visible" : "hidden";
            if (projected) {
              const half = bubble.offsetWidth / 2;
              let x = Math.max(
                half + 12,
                Math.min(canvas.clientWidth - half - 12, projected.x),
              );
              let y = Math.max(
                bubble.offsetHeight + 16,
                Math.min(canvas.clientHeight - 112, projected.y - 14),
              );
              // Keep the entire message (including its dismiss control) clear
              // of the side map. Read actual bounds: folding changes its size.
              const mapPanel = canvas.parentElement?.querySelector<HTMLElement>(
                ".mission-minimap-placement:not([hidden])",
              );
              if (mapPanel) {
                const canvasBounds = canvas.getBoundingClientRect();
                const mapBounds = mapPanel.getBoundingClientRect();
                const mapLeft = mapBounds.left - canvasBounds.left;
                const mapTop = mapBounds.top - canvasBounds.top;
                const mapBottom = mapBounds.bottom - canvasBounds.top;
                if (
                  x + half > mapLeft - 10 &&
                  y > mapTop - 10 &&
                  y - bubble.offsetHeight < mapBottom + 10
                ) {
                  if (mapLeft >= half * 2 + 22) x = mapLeft - half - 10;
                  else if (mapTop >= bubble.offsetHeight + 26) y = mapTop - 10;
                }
              }
              bubble.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
              bubble.style.setProperty(
                "--leo-tail-x",
                `${Math.max(24, Math.min(half * 2 - 24, projected.x - x + half))}px`,
              );
            }
          }
          if (traversal?.nearExit !== previousNearExit) {
            previousNearExit = traversal?.nearExit ?? false;
            setNearExit(previousNearExit);
          }
          const activity = traversal?.nearbyActivity ?? null;
          const activityKey = activity
            ? `${activity.name}:${activity.role}:${activity.text}`
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
    if (
      directoryOpen ||
      residentJournalOpen ||
      !requestedVisit ||
      engineStatus !== "ready"
    )
      return;
    // The directory dialog must unmount before it hands input back to the game.
    runtimeRef.current?.walker.setActive(false);
    runtimeRef.current?.traversal.open(requestedVisit);
    setRequestedVisit(null);
  }, [requestedVisit, directoryOpen, residentJournalOpen, engineStatus]);

  useEffect(() => {
    const focusedHouseId = selectedHouseId ?? selectedNeighborhoodHouseId;
    if (
      focusedHouseId !== null &&
      engineStatus === "ready" &&
      !residentJournalOpen
    ) {
      onWalkStart();
      runtimeRef.current?.cancelCameraAnimation();
      const traversal = runtimeRef.current?.traversal;
      if (traversal?.visit?.id !== focusedHouseId) {
        if (traversal && traversal.phase !== "outside") {
          setEntryError(
            `Walk outside ${traversal.visit?.name ?? "this building"} before visiting another home.`,
          );
        } else if (
          runtimeRef.current?.walker.active &&
          traversal?.phase === "outside"
        ) {
          setEntryError("Walk up to this home's front door to enter.");
          traversal.open(focusedHouseId);
        } else {
          traversal?.open(focusedHouseId);
        }
      }
      onSelectionConsumed();
    }
  }, [
    selectedHouseId,
    selectedNeighborhoodHouseId,
    engineStatus,
    residentJournalOpen,
    onSelectionConsumed,
    onWalkStart,
  ]);

  const changeCamera = useCallback(
    (command: "left" | "right" | "closer" | "farther" | "home") => {
      const runtime = runtimeRef.current;
      if (runtime === null || journalOpenRef.current) return;
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
    if (runtime === null || residentJournalOpen) return;
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
      disabled={residentJournalOpen}
      onPointerDown={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        runtimeRef.current?.traversal.nudge(command);
        runtimeRef.current?.traversal.hold(command, true);
      }}
      onPointerUp={() => runtimeRef.current?.traversal.hold(command, false)}
      onPointerCancel={() => runtimeRef.current?.traversal.hold(command, false)}
      onLostPointerCapture={() =>
        runtimeRef.current?.traversal.hold(command, false)
      }
      onClick={(event) => {
        if (event.detail === 0) runtimeRef.current?.traversal.nudge(command);
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
  const talkHomeId = visit
    ? visitPhase === "inside" &&
      (visit.kind === "home" || visit.venue?.kind === "apartments")
      ? visit.id
      : null
    : nearbyVenue
      ? nearbyVenue.kind === "apartments"
        ? nearbyVenue.id
        : null
      : (nearbyHouse?.id ?? null);
  const talkResidentName = talkHomeId
    ? isHouseId(talkHomeId)
      ? HOUSE_PROFILES[talkHomeId].ownerName
      : neighborhoodHomeProfile(talkHomeId).ownerName
    : null;
  const displayedLeoReply = chapter ? chapterLeoReply : leoReply;
  const displayedLeoReplyId = displayedLeoReply?.id ?? null;
  const leoBubbleEligible =
    viewMode === "walk" &&
    leoModelState === "ready" &&
    !speechBlocked &&
    chapter?.phase !== "intro" &&
    !chapterReading &&
    !residentJournalOpen &&
    !directoryOpen &&
    venue === null;
  const hideLeoReply = useCallback((id: string) => {
    // Do not steal focus from the game, notebook or chat when time runs out.
    const heldFocus = leoBubbleRef.current?.contains(document.activeElement);
    setDismissedLeoReply(id);
    if (heldFocus) canvasRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(
    () =>
      leoReplyLifetime.watch(
        displayedLeoReplyId,
        leoBubbleEligible,
        hideLeoReply,
      ),
    [leoReplyLifetime, displayedLeoReplyId, leoBubbleEligible, hideLeoReply],
  );
  const minimapVisible =
    (!chapterVisible || chapter !== null || visit !== null) &&
    chapter?.phase !== "intro" &&
    !chapterReading &&
    !residentJournalOpen &&
    !directoryOpen &&
    venue === null;

  return (
    <div
      className={`immersive-town-map${viewMode === "walk" ? " is-walking" : ""}${visit ? " is-inside-building" : ""}`}
      data-time-of-day={timeOfDay}
      data-visit-phase={visitPhase}
      data-chapter-phase={chapter?.phase ?? "none"}
      data-chapter-reading={chapterReading || undefined}
    >
      <canvas
        aria-label={
          chapter?.phase === "intro"
            ? "Opening cinematic. Use Continue to advance or Skip introduction to play."
            : visit
              ? `Inside ${visit.name}. W A S D to walk, Shift to run, arrows to turn. Walk back through the front door to leave.`
              : viewMode === "walk"
                ? "Walk around Rivergate. W A S D to move, Shift to run, arrow keys to move or turn, E to enter a nearby building. Drag to look."
                : "3D town view. Drag to turn, scroll to zoom."
        }
        tabIndex={residentJournalOpen ? -1 : 0}
        ref={canvasRef}
      />
      {engineStatus === "ready" && !visit && chapterVisible ? (
        <OpeningChapter
          state={chapter}
          savedState={savedChapter}
          onStart={() => {
            onWalkStart();
            setChapter(createChapterState());
          }}
          onResume={() => {
            onWalkStart();
            if (savedChapter) setChapter(savedChapter);
          }}
          onEvent={chapterEvent}
          onExit={() => {
            setChapter(null);
            setChapterVisible(false);
            setChapterReading(false);
          }}
          onFocusEvidence={travelToChapterPoint}
          nearbyEvidence={nearbyChapterPoint}
          onInspectNearby={() => {
            if (nearbyChapterPoint)
              chapterEvent({
                type: "collect-evidence",
                id: nearbyChapterPoint,
              });
          }}
          onDialogueActiveChange={setChapterReading}
          onLeoReply={setChapterLeoReply}
          onReturnToWorld={() =>
            canvasRef.current?.focus({ preventScroll: true })
          }
          paused={residentJournalOpen || directoryOpen || venue !== null}
        />
      ) : null}
      {!chapterVisible && !visit && engineStatus === "ready" ? (
        <button
          type="button"
          className="chapter-reopen"
          onClick={() => setChapterVisible(true)}
        >
          Opening chapter
        </button>
      ) : null}
      {engineStatus === "ready" && mapGeometry ? (
        <div className="mission-minimap-placement" hidden={!minimapVisible}>
          <MissionMinimap
            geometry={mapGeometry}
            pose={null}
            readPose={readMapPose}
            active={minimapVisible}
            target={mapGuide.target}
            status={mapGuide.status}
            mode={visit ? "indoors" : viewMode}
            timeOfDay={timeOfDay}
            closedCrossing={
              chapter &&
              !(chapter.decision === "repair" && chapter.outcomeObserved)
                ? EAST_BRIDGE_MAP_POSITION
                : null
            }
          />
        </div>
      ) : null}
      {chapter && chapterSaveFailed ? (
        <p role="status" className="chapter-save-warning">
          Chapter saving is unavailable. Keep this tab open to retain progress.
        </p>
      ) : null}
      {leoBubbleEligible &&
        displayedLeoReply &&
        dismissedLeoReply !== displayedLeoReply.id &&
        leoReplyLifetime.isLive(displayedLeoReply.id) && (
          <LeoSpeechBubble
            ref={leoBubbleRef}
            text={displayedLeoReply.text}
            timeOfDay={timeOfDay}
            onDismiss={() => {
              leoReplyLifetime.dismiss(displayedLeoReply.id);
              hideLeoReply(displayedLeoReply.id);
            }}
          />
        )}
      {viewMode === "walk" && leoModelState !== "ready" && (
        <p className="leo-load-status" role="status">
          {partyLoadMessage(leoModelState)}
        </p>
      )}
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
              Walk with Leo
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
                : "Hold the buttons to move. Tap Run to pick up the pace."}
            </span>
            <span className="walk-keyboard-hint">
              W A S D to move · Shift to run · arrows to turn · E to interact
            </span>
          </div>
          <div
            aria-label="Walking controls"
            className="town-walk-controls"
            role="group"
          >
            <button
              type="button"
              className="walk-run"
              aria-pressed={running}
              aria-keyshortcuts="Shift"
              disabled={
                residentJournalOpen ||
                (visitPhase !== "outside" && visitPhase !== "inside")
              }
              title="Toggle running, or hold Shift while moving. Drag the view to look."
              onClick={() => {
                const walker = runtimeRef.current?.traversal.walker;
                if (walker) walker.setRunning(!walker.running);
              }}
            >
              {running ? "Run · On" : "Run"}
            </button>
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
                            ? `${indoorActivity.name} · ${indoorActivity.role}${indoorActivity.text ? `: “${indoorActivity.text}”` : ""}`
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
                  disabled={residentJournalOpen}
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
                disabled={residentJournalOpen}
                onClick={() => runtimeRef.current?.walker.enterNearby()}
              >
                {nearbyVenue?.outdoor
                  ? "Visit this place"
                  : nearbyVenue
                    ? "Enter building"
                    : "Enter home"}
              </button>
            ) : null}
            {talkHomeId && onResidentTalk ? (
              <button
                type="button"
                className="town-resident-talk"
                disabled={residentJournalOpen}
                onClick={() => onResidentTalk(talkHomeId)}
              >
                {visit ? `Talk to ${talkResidentName}` : "Knock & talk"}
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

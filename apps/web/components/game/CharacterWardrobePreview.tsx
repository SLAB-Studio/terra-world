"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  ENGINEER_ROLE_PALETTES,
  engineerOutfitModelFor,
  type EngineerOutfit,
  type EngineerRole,
} from "../../lib/engineer-wardrobe";
import { loadResidentAsset } from "../../lib/immersive-town/resident-assets";
import {
  residentAnimationClipFor,
  residentAsset,
} from "../../lib/immersive-town/resident-models";

type PreviewStatus = "loading" | "ready" | "error";
type PreviewCharacter = {
  entries: InstantiatedEntries;
  mount: TransformNode;
  materials: Material[];
  stopMotion: () => void;
};
type PreviewStage = {
  scene: Scene;
  shadows: ShadowGenerator;
  slotX: number;
  slots: Record<EngineerRole, PreviewCharacter | null>;
  requests: Record<EngineerRole, number>;
};

const OUTFIT_LABELS: Record<EngineerOutfit, string> = {
  engineer: "Engineer",
  casual: "Casual",
  field: "Field gear",
};

export const WARDROBE_PREVIEW_DETAIL = "near" as const;
export const WARDROBE_PREVIEW_FRAMING = {
  fov: 0.54,
  mobileSlotX: 0.62,
  radius: 3.8,
  wideSlotX: 0.82,
  targetY: 0.9,
} as const;

export function wardrobePreviewSlotX(aspectRatio: number) {
  if (!Number.isFinite(aspectRatio)) return WARDROBE_PREVIEW_FRAMING.wideSlotX;
  const progress = Math.min(1, Math.max(0, (aspectRatio - 1.1) / 1.1));
  return (
    WARDROBE_PREVIEW_FRAMING.mobileSlotX +
    (WARDROBE_PREVIEW_FRAMING.wideSlotX -
      WARDROBE_PREVIEW_FRAMING.mobileSlotX) *
      progress
  );
}

export function wardrobePreviewHardwareScalingLevel(devicePixelRatio: number) {
  const ratio = Number.isFinite(devicePixelRatio)
    ? Math.min(2, Math.max(1, devicePixelRatio))
    : 1;
  return 1 / ratio;
}

export function wardrobeMotionTarget(
  role: EngineerRole,
  random: () => number = Math.random,
) {
  const direction = random() < 0.5 ? -1 : 1;
  return {
    shift: direction * (0.012 + random() * 0.018),
    yaw: direction * ((role === "player" ? 0.07 : 0.085) + random() * 0.075),
  };
}

function disposeCharacter(character: PreviewCharacter | null) {
  if (!character) return;
  character.stopMotion();
  character.entries.dispose();
  character.mount.dispose();
  character.materials.forEach((material) => material.dispose());
}

function beginCharacterMotion(
  entries: InstantiatedEntries,
  model: ReturnType<typeof engineerOutfitModelFor>,
  mount: TransformNode,
  role: EngineerRole,
) {
  const clips = new Map(
    entries.animationGroups.flatMap((group) => {
      const clip = residentAnimationClipFor(model, group.name);
      return clip ? ([[clip, group]] as const) : [];
    }),
  );
  const idle = clips.get("idle");
  if (!idle) return () => undefined;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const baseRotation = Math.PI;
  const baseX = mount.position.x;
  const phase = Math.random() * Math.PI * 2;
  let lastFrame = performance.now() / 1_000;
  let nextShiftAt = lastFrame + 0.8 + Math.random();
  let currentYaw = 0;
  let targetYaw = 0;
  let currentShift = 0;
  let targetShift = 0;

  idle.start(true, reducedMotion ? 0.45 : 0.52 + Math.random() * 0.14);
  if (reducedMotion) {
    idle.goToFrame(idle.from);
    idle.pause();
  }

  // Keep one complete skeletal clip in charge of the skin. Random life comes
  // from the character root, so no sparse gesture can split or double joints.
  const poseObserver = reducedMotion
    ? null
    : mount.getScene().onBeforeRenderObservable.add(() => {
        const seconds = performance.now() / 1_000;
        const elapsed = Math.min(0.1, Math.max(0, seconds - lastFrame));
        lastFrame = seconds;
        if (seconds >= nextShiftAt) {
          const target = wardrobeMotionTarget(role);
          targetYaw = target.yaw;
          targetShift = target.shift;
          nextShiftAt = seconds + 2.2 + Math.random() * 3.4;
        }

        const ease = 1 - Math.exp(-elapsed * 2.4);
        currentYaw += (targetYaw - currentYaw) * ease;
        currentShift += (targetShift - currentShift) * ease;
        mount.rotation.y =
          baseRotation + currentYaw + Math.sin(seconds * 0.42 + phase) * 0.018;
        mount.position.x = baseX + currentShift;
      });

  return () => {
    if (poseObserver)
      mount.getScene().onBeforeRenderObservable.remove(poseObserver);
    idle.stop();
  };
}

function applyPreviewPalette(meshes: AbstractMesh[], role: EngineerRole) {
  const palette = ENGINEER_ROLE_PALETTES[role];
  const copies = new Map<Material, PBRMaterial>();
  for (const mesh of meshes) {
    const source = mesh.material;
    if (!(source instanceof PBRMaterial)) continue;
    const color = palette[source.name as keyof typeof palette];
    if (!color) continue;
    let material = copies.get(source);
    if (!material) {
      material = source.clone(`wardrobe-${role}-${source.name}`) as PBRMaterial;
      material.albedoColor = Color3.FromHexString(color);
      copies.set(source, material);
    }
    mesh.material = material;
  }
  return [...copies.values()];
}

async function replacePreviewCharacter(
  stage: PreviewStage,
  role: EngineerRole,
  outfit: EngineerOutfit,
  setStatus: (role: EngineerRole, status: PreviewStatus) => void,
) {
  const request = ++stage.requests[role];
  setStatus(role, "loading");
  const model = engineerOutfitModelFor(role, outfit);
  try {
    const container = await loadResidentAsset(
      stage.scene,
      model,
      WARDROBE_PREVIEW_DETAIL,
    );
    if (stage.scene.isDisposed || request !== stage.requests[role]) return;
    const entries = container.instantiateModelsToScene(
      (name) => `wardrobe-${role}-${request}:${name}`,
      false,
      { doNotInstantiate: true },
    );
    const mount = new TransformNode(`wardrobe-${role}-${request}`, stage.scene);
    mount.position.x = role === "player" ? -stage.slotX : stage.slotX;
    mount.rotation.y = Math.PI;
    mount.scaling.setAll(
      1.72 / residentAsset(model, WARDROBE_PREVIEW_DETAIL).height,
    );
    entries.rootNodes.forEach((root) => (root.parent = mount));
    const meshes = mount.getChildMeshes();
    meshes.forEach((mesh) => {
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      if (mesh.getTotalVertices() > 0)
        stage.shadows.addShadowCaster(mesh, false);
    });
    const materials =
      model === "engineer-worker" ? applyPreviewPalette(meshes, role) : [];
    const stopMotion = beginCharacterMotion(entries, model, mount, role);
    if (stage.scene.isDisposed || request !== stage.requests[role]) {
      disposeCharacter({ entries, mount, materials, stopMotion });
      return;
    }
    const previous = stage.slots[role];
    stage.slots[role] = { entries, mount, materials, stopMotion };
    disposeCharacter(previous);
    setStatus(role, "ready");
  } catch {
    if (!stage.scene.isDisposed && request === stage.requests[role])
      setStatus(role, "error");
  }
}

export default function CharacterWardrobePreview({
  leoOutfit,
  playerOutfit,
}: {
  readonly leoOutfit: EngineerOutfit;
  readonly playerOutfit: EngineerOutfit;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<PreviewStage | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const [statuses, setStatuses] = useState<Record<EngineerRole, PreviewStatus>>(
    { player: "loading", leo: "loading" },
  );
  const setStatus = useCallback(
    (role: EngineerRole, status: PreviewStatus) =>
      setStatuses((current) => ({ ...current, [role]: status })),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new Engine(
      canvas,
      true,
      {
        preserveDrawingBuffer: false,
        stencil: false,
        premultipliedAlpha: false,
      },
      true,
    );
    engine.setHardwareScalingLevel(
      wardrobePreviewHardwareScalingLevel(window.devicePixelRatio),
    );
    const scene = new Scene(engine);
    scene.clearColor = new Color4(17 / 255, 28 / 255, 34 / 255, 1);
    scene.imageProcessingConfiguration.contrast = 1.12;
    scene.imageProcessingConfiguration.exposure = 1.08;

    const camera = new ArcRotateCamera(
      "wardrobe-camera",
      -Math.PI / 2,
      Math.PI / 2.08,
      WARDROBE_PREVIEW_FRAMING.radius,
      new Vector3(0, WARDROBE_PREVIEW_FRAMING.targetY, 0),
      scene,
    );
    camera.fov = WARDROBE_PREVIEW_FRAMING.fov;
    camera.inputs.clear();
    scene.activeCamera = camera;

    const ambient = new HemisphericLight(
      "wardrobe-ambient",
      new Vector3(0, 1, -0.4),
      scene,
    );
    ambient.diffuse = Color3.FromHexString("#F7E9D1");
    ambient.groundColor = Color3.FromHexString("#253943");
    ambient.intensity = 1.5;
    const key = new DirectionalLight(
      "wardrobe-key",
      new Vector3(-0.35, -1, 0.55),
      scene,
    );
    key.position = new Vector3(2.4, 4, -3);
    key.intensity = 1.15;
    const shadows = new ShadowGenerator(512, key);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 12;

    const floor = MeshBuilder.CreateGround(
      "wardrobe-floor",
      { width: 4.4, height: 2.5 },
      scene,
    );
    const floorMaterial = new StandardMaterial("wardrobe-floor-finish", scene);
    floorMaterial.diffuseColor = Color3.FromHexString("#253943");
    floorMaterial.specularColor = Color3.Black();
    floor.material = floorMaterial;
    floor.receiveShadows = true;

    stageRef.current = {
      scene,
      shadows,
      slotX: wardrobePreviewSlotX(canvas.clientWidth / canvas.clientHeight),
      slots: { player: null, leo: null },
      requests: { player: 0, leo: 0 },
    };
    const render = () => scene.render();
    let inView = true;
    let rendering = false;
    const updateRendering = () => {
      const shouldRender = document.visibilityState === "visible" && inView;
      if (shouldRender === rendering) return;
      rendering = shouldRender;
      if (shouldRender) engine.runRenderLoop(render);
      else engine.stopRenderLoop(render);
    };
    const visibilityObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([entry]) => {
              inView = entry?.isIntersecting ?? true;
              updateRendering();
            },
            { threshold: 0.02 },
          );
    visibilityObserver?.observe(canvas);
    document.addEventListener("visibilitychange", updateRendering);
    updateRendering();
    const resize = () => {
      const stage = stageRef.current;
      if (stage) {
        stage.slotX = wardrobePreviewSlotX(
          canvas.clientWidth / canvas.clientHeight,
        );
        if (stage.slots.player)
          stage.slots.player.mount.position.x = -stage.slotX;
        if (stage.slots.leo) stage.slots.leo.mount.position.x = stage.slotX;
      }
      const scaling = wardrobePreviewHardwareScalingLevel(
        window.devicePixelRatio,
      );
      if (Math.abs(engine.getHardwareScalingLevel() - scaling) > 0.001) {
        engine.setHardwareScalingLevel(scaling);
      } else {
        engine.resize();
      }
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", resize);
    setStageReady(true);
    return () => {
      setStageReady(false);
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", updateRendering);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop(render);
      const stage = stageRef.current;
      if (stage) {
        stage.requests.player += 1;
        stage.requests.leo += 1;
        disposeCharacter(stage.slots.player);
        disposeCharacter(stage.slots.leo);
      }
      stageRef.current = null;
      scene.dispose();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (stageReady && stage)
      void replacePreviewCharacter(stage, "player", playerOutfit, setStatus);
  }, [playerOutfit, setStatus, stageReady]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stageReady && stage)
      void replacePreviewCharacter(stage, "leo", leoOutfit, setStatus);
  }, [leoOutfit, setStatus, stageReady]);

  const description = `Live wardrobe preview: Your engineer in ${OUTFIT_LABELS[playerOutfit]}; Leo in ${OUTFIT_LABELS[leoOutfit]}.`;
  const statusText = Object.values(statuses).includes("error")
    ? "One preview could not load. Your saved choice is unchanged."
    : Object.values(statuses).includes("loading")
      ? "Updating preview…"
      : "Preview ready";

  return (
    <div
      aria-label={description}
      className="wardrobe-preview"
      data-leo-outfit={leoOutfit}
      data-player-outfit={playerOutfit}
      role="group"
    >
      <canvas aria-hidden="true" ref={canvasRef} />
      <div className="wardrobe-preview-identities" aria-hidden="true">
        <span>
          <strong>Your engineer</strong>
          <small>{OUTFIT_LABELS[playerOutfit]}</small>
        </span>
        <span>
          <strong>Leo</strong>
          <small>{OUTFIT_LABELS[leoOutfit]}</small>
        </span>
      </div>
      <span className="wardrobe-preview-status" role="status">
        {statusText}
      </span>
    </div>
  );
}

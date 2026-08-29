import type {
  AbstractMesh,
  ArcRotateCamera,
  Engine,
  Mesh,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

export type TownCompoundId =
  "sunflower-court" | "riverbend-gardens" | "orchard-lane";

export type TownQuality = "low" | "medium" | "high";

export type TownHouseMetadata = Readonly<{
  id: string;
  compoundId: TownCompoundId;
  displayName: string;
  root: TransformNode;
  pickMesh: Mesh;
  meshes: readonly AbstractMesh[];
  worldPosition: Vector3;
}>;

export type TownCompoundMetadata = Readonly<{
  id: TownCompoundId;
  displayName: string;
  root: TransformNode;
  houses: readonly TownHouseMetadata[];
}>;

export type TownAnimationFrame = Readonly<{
  deltaSeconds: number;
  elapsedSeconds: number;
  reducedMotion: boolean;
}>;

export type TownAnimationListener = (frame: TownAnimationFrame) => void;

export interface TownAnimationController {
  readonly paused: boolean;
  readonly reducedMotion: boolean;
  setPaused(paused: boolean): void;
  setReducedMotion(reducedMotion: boolean): void;
  subscribe(listener: TownAnimationListener): () => void;
  dispose(): void;
}

export type CreateTownWorldOptions = Readonly<{
  attachCameraControls?: boolean;
  cameraTarget?: Vector3;
  reducedMotion?: boolean;
  quality?: TownQuality;
}>;

export interface ImmersiveTownWorld {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly compounds: readonly TownCompoundMetadata[];
  readonly houses: readonly TownHouseMetadata[];
  readonly animation: TownAnimationController;
  getHouseFromMesh(mesh: AbstractMesh | null): TownHouseMetadata | null;
  render(): void;
  resize(): void;
  dispose(): void;
}

"use client";

import type Phaser from "phaser";
import { memo, useEffect, useRef } from "react";
import type { CityState, Coordinate, Rotation } from "@terra/campaign-schema";

import { buildingName } from "../../lib/game/catalogue";
import type { OverlayView } from "../../lib/game/controller";

const TILE_SIZE = 54;

export type GameMapApi = {
  readonly screenToTile: (
    clientX: number,
    clientY: number,
  ) => Coordinate | null;
};

type GameMapProps = {
  readonly city: CityState;
  readonly overlay: OverlayView;
  readonly cursor: Coordinate;
  readonly selectedBuildingId: string | null;
  readonly rotation: Rotation;
  readonly onTileActivate: (coordinate: Coordinate) => void;
  readonly onReady: (api: GameMapApi | null) => void;
  readonly onError: (message: string | null) => void;
};

type SceneView = Pick<
  GameMapProps,
  | "city"
  | "overlay"
  | "cursor"
  | "selectedBuildingId"
  | "rotation"
  | "onTileActivate"
>;

const TERRAIN_COLORS: Readonly<Record<string, number>> = {
  river: 0x4a96b6,
  floodplain: 0xaacb9b,
  meadow: 0x88bc72,
  forest: 0x4f8657,
  wetland: 0x67a38b,
  hillside: 0xaaa06e,
  rock: 0x888b81,
};
const OVERLAY_COLORS = {
  good: 0x4bc276,
  warn: 0xe7ae48,
  bad: 0xd85c52,
  info: 0x4d8ed1,
  quiet: 0x52645c,
} as const;
const BUILDING_COLORS: Readonly<Record<string, number>> = {
  housing: 0xf6d391,
  water: 0x7ac8db,
  energy: 0xf6c75b,
  service: 0xe8a5a8,
  transport: 0xc7c4ba,
  waste: 0xb28c72,
  nature: 0x6fb875,
};

function GameMap(props: GameMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<
    | (Phaser.Scene & {
        setView: (view: SceneView) => void;
        screenToTile: GameMapApi["screenToTile"];
      })
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    async function mountGame() {
      try {
        const PhaserModule = await import("phaser");
        if (cancelled || hostRef.current === null) return;
        const PhaserLib = PhaserModule.default;
        class RivergateScene extends PhaserLib.Scene {
          private view: SceneView = propsRef.current;
          private graphics?: Phaser.GameObjects.Graphics;
          private labels: Phaser.GameObjects.Text[] = [];
          private dragStart:
            | {
                x: number;
                y: number;
                scrollX: number;
                scrollY: number;
              }
            | undefined;

          constructor() {
            super("rivergate");
          }

          create() {
            this.graphics = this.add.graphics();
            const width =
              Math.max(
                ...this.view.city.tiles.map((tile) => tile.coordinate.x + 1),
              ) * TILE_SIZE;
            const height =
              Math.max(
                ...this.view.city.tiles.map((tile) => tile.coordinate.y + 1),
              ) * TILE_SIZE;
            this.cameras.main.setBackgroundColor(0x183a31);
            this.cameras.main.setBounds(0, 0, width, height);
            this.cameras.main.centerOn(width / 2, height / 2);
            this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
              this.dragStart = {
                x: pointer.x,
                y: pointer.y,
                scrollX: this.cameras.main.scrollX,
                scrollY: this.cameras.main.scrollY,
              };
            });
            this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
              if (!pointer.isDown || this.dragStart === undefined) return;
              this.cameras.main.setScroll(
                this.dragStart.scrollX -
                  (pointer.x - this.dragStart.x) / this.cameras.main.zoom,
                this.dragStart.scrollY -
                  (pointer.y - this.dragStart.y) / this.cameras.main.zoom,
              );
            });
            this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
              const start = this.dragStart;
              this.dragStart = undefined;
              if (
                start === undefined ||
                Math.hypot(pointer.x - start.x, pointer.y - start.y) > 7
              )
                return;
              const bounds = this.game.canvas.getBoundingClientRect();
              const point = this.screenToTile(
                bounds.left +
                  (pointer.x / this.game.canvas.width) * bounds.width,
                bounds.top +
                  (pointer.y / this.game.canvas.height) * bounds.height,
              );
              if (point !== null) this.view.onTileActivate(point);
            });
            this.input.on(
              "wheel",
              (
                _pointer: Phaser.Input.Pointer,
                _objects: Phaser.GameObjects.GameObject[],
                _dx: number,
                dy: number,
              ) => {
                this.cameras.main.setZoom(
                  PhaserLib.Math.Clamp(
                    this.cameras.main.zoom - dy * 0.001,
                    0.7,
                    1.35,
                  ),
                );
              },
            );
            this.renderView();
          }

          setView(view: SceneView) {
            const cursorMoved =
              this.view.cursor.x !== view.cursor.x ||
              this.view.cursor.y !== view.cursor.y;
            this.view = view;
            if (this.scene.isActive()) {
              if (cursorMoved) this.keepCursorVisible();
              this.renderView();
            }
          }

          private keepCursorVisible() {
            const camera = this.cameras.main;
            const cursorX = this.view.cursor.x * TILE_SIZE + TILE_SIZE / 2;
            const cursorY = this.view.cursor.y * TILE_SIZE + TILE_SIZE / 2;
            const visibleWidth = camera.width / camera.zoom;
            const visibleHeight = camera.height / camera.zoom;
            const padding = TILE_SIZE / 2;
            const outsideViewport =
              cursorX < camera.scrollX + padding ||
              cursorX > camera.scrollX + visibleWidth - padding ||
              cursorY < camera.scrollY + padding ||
              cursorY > camera.scrollY + visibleHeight - padding;
            if (outsideViewport) camera.centerOn(cursorX, cursorY);
          }

          screenToTile = (
            clientX: number,
            clientY: number,
          ): Coordinate | null => {
            const canvas = this.game.canvas;
            const bounds = canvas.getBoundingClientRect();
            if (
              clientX < bounds.left ||
              clientX > bounds.right ||
              clientY < bounds.top ||
              clientY > bounds.bottom
            )
              return null;
            const point = this.cameras.main.getWorldPoint(
              ((clientX - bounds.left) / bounds.width) * canvas.width,
              ((clientY - bounds.top) / bounds.height) * canvas.height,
            );
            const coordinate = {
              x: Math.floor(point.x / TILE_SIZE),
              y: Math.floor(point.y / TILE_SIZE),
            };
            return this.view.city.tiles.some(
              (tile) =>
                tile.coordinate.x === coordinate.x &&
                tile.coordinate.y === coordinate.y,
            )
              ? coordinate
              : null;
          };

          private renderView() {
            if (this.graphics === undefined) return;
            this.graphics.clear();
            for (const label of this.labels) label.destroy();
            this.labels = [];
            const buildingById = new Map(
              this.view.city.buildings.map((building) => [
                building.instanceId,
                building,
              ]),
            );
            for (const tile of this.view.city.tiles) {
              const left = tile.coordinate.x * TILE_SIZE;
              const top = tile.coordinate.y * TILE_SIZE;
              this.graphics.fillStyle(
                TERRAIN_COLORS[tile.terrain] ?? 0x83947d,
                1,
              );
              this.graphics.fillRect(
                left + 1,
                top + 1,
                TILE_SIZE - 2,
                TILE_SIZE - 2,
              );
              this.graphics.lineStyle(1, 0xdde9d2, 0.24);
              this.graphics.strokeRect(
                left + 1.5,
                top + 1.5,
                TILE_SIZE - 3,
                TILE_SIZE - 3,
              );
              if (tile.terrain === "river") {
                this.graphics.lineStyle(2, 0xc2e7ee, 0.56);
                this.graphics.lineBetween(
                  left + 8,
                  top + 18,
                  left + 45,
                  top + 18,
                );
                this.graphics.lineBetween(
                  left + 4,
                  top + 34,
                  left + 40,
                  top + 34,
                );
              }
              this.drawOverlay(left, top, this.view.overlay.cells[tile.id]);
              if (tile.occupantId !== null) {
                const building = buildingById.get(tile.occupantId);
                if (building !== undefined)
                  this.drawBuilding(left, top, building.definitionId);
              }
            }
            const cursorLeft = this.view.cursor.x * TILE_SIZE;
            const cursorTop = this.view.cursor.y * TILE_SIZE;
            this.graphics.lineStyle(4, 0xffffff, 1);
            this.graphics.strokeRect(
              cursorLeft + 3,
              cursorTop + 3,
              TILE_SIZE - 6,
              TILE_SIZE - 6,
            );
            this.graphics.lineStyle(2, 0x1b352e, 1);
            this.graphics.strokeRect(
              cursorLeft + 6,
              cursorTop + 6,
              TILE_SIZE - 12,
              TILE_SIZE - 12,
            );
          }

          private drawOverlay(
            left: number,
            top: number,
            cell: OverlayView["cells"][string] | undefined,
          ) {
            if (cell === undefined || this.graphics === undefined) return;
            const color = OVERLAY_COLORS[cell.tone];
            this.graphics.fillStyle(color, 0.2 + cell.strength * 0.25);
            this.graphics.fillRect(
              left + 3,
              top + 3,
              TILE_SIZE - 6,
              TILE_SIZE - 6,
            );
            this.graphics.lineStyle(2, color, 0.85);
            if (cell.pattern === "lines" || cell.pattern === "cross") {
              for (let offset = 8; offset < TILE_SIZE; offset += 10)
                this.graphics.lineBetween(
                  left + offset,
                  top + 4,
                  left + 4,
                  top + offset,
                );
            }
            if (cell.pattern === "dots") {
              for (let y = 12; y < TILE_SIZE; y += 15)
                for (let x = 12; x < TILE_SIZE; x += 15)
                  this.graphics.fillCircle(left + x, top + y, 1.8);
            }
            if (cell.pattern === "cross")
              this.graphics.lineBetween(
                left + 8,
                top + 8,
                left + TILE_SIZE - 8,
                top + TILE_SIZE - 8,
              );
            this.labels.push(
              this.add.text(left + 5, top + 4, cell.label, {
                fontFamily: "Arial, sans-serif",
                fontSize: cell.label.length > 3 ? "9px" : "11px",
                fontStyle: "bold",
                color: "#ffffff",
                backgroundColor: "rgba(18,45,38,.74)",
                padding: { x: 3, y: 2 },
              }),
            );
          }

          private drawBuilding(
            left: number,
            top: number,
            definitionId: string,
          ) {
            if (this.graphics === undefined) return;
            const category = BUILDING_CATEGORY[definitionId] ?? "housing";
            this.graphics.fillStyle(BUILDING_COLORS[category] ?? 0xf0cc8c, 1);
            this.graphics.fillRoundedRect(
              left + 10,
              top + 14,
              TILE_SIZE - 20,
              TILE_SIZE - 22,
              4,
            );
            this.graphics.lineStyle(2, 0x1f3e34, 0.9);
            this.graphics.strokeRoundedRect(
              left + 10,
              top + 14,
              TILE_SIZE - 20,
              TILE_SIZE - 22,
              4,
            );
            const initials = buildingName(definitionId)
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            this.labels.push(
              this.add
                .text(left + TILE_SIZE / 2, top + TILE_SIZE / 2 + 1, initials, {
                  fontFamily: "Arial, sans-serif",
                  fontSize: "12px",
                  fontStyle: "bold",
                  color: "#173b31",
                })
                .setOrigin(0.5),
            );
          }
        }

        const scene = new RivergateScene();
        sceneRef.current = scene;
        gameRef.current = new PhaserLib.Game({
          type: PhaserLib.AUTO,
          parent: hostRef.current,
          backgroundColor: "#183a31",
          render: { antialias: true, pixelArt: false },
          scale: {
            mode: PhaserLib.Scale.RESIZE,
            width: "100%",
            height: "100%",
          },
          scene,
          input: {
            mouse: { preventDefaultWheel: false },
            touch: { capture: false },
          },
        });
        propsRef.current.onReady({ screenToTile: scene.screenToTile });
        propsRef.current.onError(null);
      } catch (error) {
        propsRef.current.onError(
          error instanceof Error
            ? error.message
            : "The map renderer could not start.",
        );
      }
    }
    void mountGame();
    return () => {
      cancelled = true;
      propsRef.current.onReady(null);
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setView({
      city: props.city,
      overlay: props.overlay,
      cursor: props.cursor,
      selectedBuildingId: props.selectedBuildingId,
      rotation: props.rotation,
      onTileActivate: props.onTileActivate,
    });
  }, [
    props.city,
    props.cursor,
    props.onTileActivate,
    props.overlay,
    props.rotation,
    props.selectedBuildingId,
  ]);
  return <div className="game-map-canvas" ref={hostRef} />;
}

export default memo(GameMap);

const BUILDING_CATEGORY: Readonly<Record<string, string>> = {
  home: "housing",
  road: "transport",
  "water-pump": "water",
  "water-treatment-plant": "water",
  "solar-array": "energy",
  battery: "energy",
  school: "service",
  clinic: "service",
  "bus-stop": "transport",
  "recycling-centre": "waste",
  wetland: "nature",
  "community-park": "nature",
};

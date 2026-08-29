"use client";

import type Phaser from "phaser";
import { memo, useEffect, useRef } from "react";

import {
  MAIN_ROAD_LANE_OFFSET,
  MAIN_ROAD_WIDTH,
  sampleCarLane,
  sampleRoadCenterline,
} from "../../lib/town-road";

const WORLD_WIDTH = 1800;
const WORLD_HEIGHT = 900;

type MovingVehicle = Readonly<{
  body: Phaser.GameObjects.Container;
  laneOffset: number;
  progressOffset: number;
  reverse: boolean;
  speed: number;
}>;

/**
 * Phaser owns the continuous environmental simulation underneath the HTML
 * house controls. The road drawing and every vehicle use the same route
 * sampler, making it impossible for cars to drift onto lawns or buildings.
 */
function ImmersiveTownMap() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;

    async function mountEngine() {
      const PhaserModule = await import("phaser");
      if (cancelled || hostRef.current === null) return;
      const PhaserLib = PhaserModule.default;

      class LivingRivergateScene extends PhaserLib.Scene {
        private vehicles: MovingVehicle[] = [];
        private elapsedSeconds = 0;
        private reducedMotion = false;
        private reduceMotionQuery?: MediaQueryList;
        private cloudShadows: Phaser.GameObjects.Ellipse[] = [];

        constructor() {
          super("living-rivergate");
        }

        create() {
          this.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
          this.drawGroundDepth();
          this.drawMainRoad();
          this.drawFootpaths();
          this.drawRoadFurniture();
          this.createCloudShadows();
          this.createVehicles();

          this.reduceMotionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          );
          this.reducedMotion = this.reduceMotionQuery.matches;
          const updateMotionPreference = (event: MediaQueryListEvent) => {
            this.reducedMotion = event.matches;
          };
          this.reduceMotionQuery.addEventListener(
            "change",
            updateMotionPreference,
          );
          this.events.once(PhaserLib.Scenes.Events.SHUTDOWN, () =>
            this.reduceMotionQuery?.removeEventListener(
              "change",
              updateMotionPreference,
            ),
          );
        }

        update(_time: number, delta: number) {
          if (document.hidden) return;
          const seconds = Math.min(delta, 60) / 1000;
          if (!this.reducedMotion) this.elapsedSeconds += seconds;
          this.updateVehicles();
          this.updateCloudShadows(seconds);
        }

        private drawGroundDepth() {
          const graphics = this.add.graphics().setDepth(1);
          graphics.fillStyle(0x2d7550, 0.34);
          graphics.fillEllipse(270, 190, 520, 260);
          graphics.fillStyle(0x174d36, 0.2);
          graphics.fillEllipse(1450, 720, 760, 330);
          graphics.fillStyle(0xa7d77e, 0.08);
          graphics.fillEllipse(930, 120, 670, 210);

          graphics.lineStyle(2, 0xc8f0a4, 0.12);
          for (let offset = -420; offset < 1950; offset += 145) {
            graphics.lineBetween(offset, 0, offset + 600, WORLD_HEIGHT);
          }
          graphics.lineStyle(2, 0x133f2e, 0.12);
          for (let offset = -180; offset < 2050; offset += 190) {
            graphics.lineBetween(offset, WORLD_HEIGHT, offset + 510, 0);
          }
        }

        private drawMainRoad() {
          const graphics = this.add.graphics().setDepth(10);
          const points = roadPoints(240);

          graphics.lineStyle(MAIN_ROAD_WIDTH + 24, 0x163b2d, 0.34);
          graphics.strokePoints(
            points.map((point) => ({ x: point.x + 4, y: point.y + 12 })),
            false,
          );
          graphics.lineStyle(MAIN_ROAD_WIDTH + 18, 0xe8d7ab, 1);
          graphics.strokePoints(points, false);
          graphics.lineStyle(MAIN_ROAD_WIDTH + 4, 0xf6e9c4, 1);
          graphics.strokePoints(points, false);
          graphics.lineStyle(MAIN_ROAD_WIDTH, 0x46545a, 1);
          graphics.strokePoints(points, false);

          graphics.lineStyle(3, 0xf9e6a0, 0.9);
          for (let index = 2; index < points.length - 5; index += 12) {
            const start = points[index];
            const end = points[index + 5];
            if (start !== undefined && end !== undefined)
              graphics.lineBetween(start.x, start.y, end.x, end.y);
          }

          graphics.lineStyle(3, 0xf9f2dd, 0.76);
          for (const edgeOffset of [
            -(MAIN_ROAD_WIDTH / 2 - 5),
            MAIN_ROAD_WIDTH / 2 - 5,
          ]) {
            const edge = lanePoints(edgeOffset, 180);
            graphics.strokePoints(edge, false);
          }

          this.drawCrosswalk(graphics, 0.58);
          this.drawCrosswalk(graphics, 0.78);
        }

        private drawCrosswalk(
          graphics: Phaser.GameObjects.Graphics,
          progress: number,
        ) {
          const centre = sampleCarLane(progress, 0);
          const tangentX = Math.cos(centre.angle);
          const tangentY = Math.sin(centre.angle);
          const normalX = -tangentY;
          const normalY = tangentX;
          graphics.lineStyle(5, 0xfff8df, 0.84);
          for (let stripe = -18; stripe <= 18; stripe += 9) {
            const stripeX = centre.x + tangentX * stripe;
            const stripeY = centre.y + tangentY * stripe;
            graphics.lineBetween(
              stripeX - normalX * (MAIN_ROAD_WIDTH / 2 - 8),
              stripeY - normalY * (MAIN_ROAD_WIDTH / 2 - 8),
              stripeX + normalX * (MAIN_ROAD_WIDTH / 2 - 8),
              stripeY + normalY * (MAIN_ROAD_WIDTH / 2 - 8),
            );
          }
        }

        private drawFootpaths() {
          const graphics = this.add.graphics().setDepth(7);
          const paths = [
            { from: sampleRoadCenterline(0.33), to: { x: 520, y: 284 } },
            { from: sampleRoadCenterline(0.49), to: { x: 875, y: 365 } },
            { from: sampleRoadCenterline(0.77), to: { x: 1415, y: 612 } },
          ];
          graphics.lineStyle(28, 0x163b2d, 0.18);
          for (const path of paths)
            graphics.lineBetween(
              path.from.x + 3,
              path.from.y + 7,
              path.to.x + 3,
              path.to.y + 7,
            );
          graphics.lineStyle(22, 0xe7c980, 1);
          for (const path of paths)
            graphics.lineBetween(
              path.from.x,
              path.from.y,
              path.to.x,
              path.to.y,
            );
          graphics.lineStyle(2, 0xfff4c7, 0.68);
          for (const path of paths)
            graphics.lineBetween(
              path.from.x,
              path.from.y,
              path.to.x,
              path.to.y,
            );
        }

        private drawRoadFurniture() {
          const graphics = this.add.graphics().setDepth(16);
          for (const progress of [0.13, 0.28, 0.43, 0.66, 0.86]) {
            const light = sampleCarLane(progress, -(MAIN_ROAD_WIDTH / 2 + 26));
            graphics.fillStyle(0x18382e, 0.2);
            graphics.fillEllipse(light.x + 9, light.y + 10, 30, 12);
            graphics.lineStyle(5, 0x2b190f, 1);
            graphics.lineBetween(light.x, light.y + 2, light.x, light.y - 40);
            graphics.fillStyle(0xffd24a, 1);
            graphics.fillCircle(light.x, light.y - 44, 8);
            graphics.lineStyle(2, 0xfff4b1, 0.8);
            graphics.strokeCircle(light.x, light.y - 44, 12);
          }

          const sign = sampleCarLane(0.74, MAIN_ROAD_WIDTH / 2 + 28);
          graphics.lineStyle(5, 0x2b190f, 1);
          graphics.lineBetween(sign.x, sign.y, sign.x, sign.y - 42);
          graphics.fillStyle(0x62aef0, 1);
          graphics.fillRoundedRect(sign.x - 27, sign.y - 68, 54, 28, 7);
          graphics.lineStyle(3, 0x2b190f, 1);
          graphics.strokeRoundedRect(sign.x - 27, sign.y - 68, 54, 28, 7);
        }

        private createCloudShadows() {
          this.cloudShadows = [
            this.add
              .ellipse(280, 150, 240, 88, 0x173d2e, 0.09)
              .setDepth(3)
              .setRotation(-0.1),
            this.add
              .ellipse(1180, 650, 310, 110, 0x173d2e, 0.08)
              .setDepth(3)
              .setRotation(0.07),
          ];
        }

        private createVehicles() {
          this.vehicles = [
            {
              body: this.createCar(0xffc93d, 1),
              laneOffset: MAIN_ROAD_LANE_OFFSET,
              progressOffset: 0.04,
              reverse: false,
              speed: 0.028,
            },
            {
              body: this.createCar(0x62aef0, 0.92),
              laneOffset: -MAIN_ROAD_LANE_OFFSET,
              progressOffset: 0.48,
              reverse: true,
              speed: 0.024,
            },
            {
              body: this.createCar(0xf47f70, 0.82),
              laneOffset: MAIN_ROAD_LANE_OFFSET,
              progressOffset: 0.72,
              reverse: false,
              speed: 0.02,
            },
          ];
          this.updateVehicles();
        }

        private createCar(color: number, scale: number) {
          const container = this.add
            .container(0, 0)
            .setDepth(28)
            .setScale(scale);
          const graphics = this.add.graphics();
          graphics.fillStyle(0x142f27, 0.28);
          graphics.fillEllipse(4, 8, 72, 24);
          graphics.fillStyle(0x2b190f, 1);
          graphics.fillCircle(-21, 13, 8);
          graphics.fillCircle(21, 13, 8);
          graphics.fillStyle(0x5d4b63, 1);
          graphics.fillCircle(-21, 13, 4);
          graphics.fillCircle(21, 13, 4);
          graphics.fillStyle(color, 1);
          graphics.fillRoundedRect(-34, -13, 68, 28, 9);
          graphics.lineStyle(3, 0x2b190f, 1);
          graphics.strokeRoundedRect(-34, -13, 68, 28, 9);
          graphics.fillStyle(color, 1);
          graphics.fillRoundedRect(-14, -28, 36, 20, 9);
          graphics.lineStyle(3, 0x2b190f, 1);
          graphics.strokeRoundedRect(-14, -28, 36, 20, 9);
          graphics.fillStyle(0xbfefff, 1);
          graphics.fillRoundedRect(-8, -24, 23, 13, 5);
          graphics.fillStyle(0xfff2a8, 1);
          graphics.fillCircle(30, -6, 4);
          graphics.fillCircle(30, 7, 4);
          container.add(graphics);
          return container;
        }

        private updateVehicles() {
          for (const vehicle of this.vehicles) {
            const rawProgress =
              vehicle.progressOffset + this.elapsedSeconds * vehicle.speed;
            const progress = vehicle.reverse ? 1 - rawProgress : rawProgress;
            const pose = sampleCarLane(progress, vehicle.laneOffset);
            vehicle.body.setPosition(pose.x, pose.y);
            vehicle.body.setRotation(
              pose.angle + (vehicle.reverse ? Math.PI : 0),
            );
          }
        }

        private updateCloudShadows(seconds: number) {
          if (this.reducedMotion) return;
          this.cloudShadows.forEach((shadow, index) => {
            const speed = index === 0 ? 6 : 4;
            shadow.x += speed * seconds;
            if (shadow.x > WORLD_WIDTH + 180) shadow.x = -180;
          });
        }
      }

      game = new PhaserLib.Game({
        type: PhaserLib.AUTO,
        parent: hostRef.current,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        transparent: true,
        render: { antialias: true, pixelArt: false, roundPixels: false },
        scene: LivingRivergateScene,
        input: { keyboard: false, mouse: false, touch: false },
        audio: { noAudio: true },
      });
    }

    void mountEngine();
    return () => {
      cancelled = true;
      game?.destroy(true);
      game = null;
    };
  }, []);

  return (
    <div aria-hidden="true" className="immersive-town-map" ref={hostRef} />
  );
}

function roadPoints(count: number): RoadSample[] {
  return Array.from({ length: count + 1 }, (_, index) =>
    sampleRoadCenterline(Math.min(index / count, 0.999_999)),
  );
}

function lanePoints(offset: number, count: number): RoadSample[] {
  return Array.from({ length: count + 1 }, (_, index) =>
    sampleCarLane(Math.min(index / count, 0.999_999), offset),
  );
}

type RoadSample = Readonly<{ x: number; y: number }>;

export default memo(ImmersiveTownMap);

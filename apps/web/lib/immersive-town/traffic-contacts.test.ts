import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  collectTrafficPeople,
  createTrafficContacts,
} from "./traffic-contacts";
import {
  createTrafficSimulation,
  getVehicleTransforms,
  stepTraffic,
} from "./traffic";
import { getTrafficPedestrianHazards } from "./traffic-pedestrians";
import { createTrafficHornController } from "./traffic-horn";
import { advanceRoadProgress, sampleLane } from "./road";
import { stepWalk } from "./walking";
import { pacedInput } from "./locomotion-input";

const oneCar = () =>
  createTrafficSimulation([
    {
      id: "car",
      laneId: "clockwise",
      startProgress: 0.1,
      cruiseSpeedMetersPerSecond: 8,
      lengthMeters: 4,
    },
  ]);

describe("traffic and walking share physical bodies", () => {
  it("reads real Babylon player and dog coordinates through Vector3 accessors", () => {
    const people = collectTrafficPeople([], [], {
      player: new Vector3(12, 2, 34),
      dog: new Vector3(13, 1, 35),
    });
    expect(people).toEqual([
      { id: "player-rivergate", x: 12, z: 34, radius: 0.4 },
      { id: "leo-dog", x: 13, z: 35, radius: 0.75 },
    ]);
  });
  it("includes visible residents, bystanders, player and Leo, not indoor people or seated passengers", () => {
    const residents = [
      "walking",
      "idle",
      "inside",
      "seated",
      "riding",
      "boarding",
      "alighting",
    ].map((mode) => ({
      id: mode,
      mode,
      x: 1,
      z: 2,
      ride: { vehicleId: "bus" },
    }));
    const people = collectTrafficPeople(
      residents,
      [
        { id: "walking", x: 99, z: 99 },
        { id: "doorstep", x: 3, z: 4 },
      ],
      { player: { x: 5, z: 6 }, dog: { x: 5, z: 7 } },
    );
    expect(people.map((person) => person.id)).toEqual([
      "walking",
      "idle",
      "boarding",
      "alighting",
      "doorstep",
      "player-rivergate",
      "leo-dog",
    ]);
    expect(
      people
        .filter((person) => person.ignoreVehicleId)
        .map((person) => person.id),
    ).toEqual(["boarding", "alighting"]);
    expect(people.find((person) => person.id === "walking")?.x).toBe(1);
    expect(collectTrafficPeople([], [], null)).toEqual([]);
  });

  it("protects the actual rendered turn pose rather than the logical lane pose", () => {
    const traffic = oneCar();
    const contacts = createTrafficContacts();
    const transform = getVehicleTransforms(traffic)[0]!;
    contacts.update(traffic, [
      { ...transform, position: { x: -30, y: 0, z: -30 }, yawRadians: 0 },
    ]);
    expect(contacts.canStand(transform.position)).toBe(true);
    expect(contacts.canStand({ x: -30, z: -30 })).toBe(false);
    expect(contacts.canMove({ x: -35, z: -30 }, { x: -25, z: -30 })).toBe(
      false,
    );
    expect(contacts.canStand({ x: -28.3, z: -30 }, 0.4)).toBe(true);
    expect(contacts.canStand({ x: -28.3, z: -30 }, 0.75)).toBe(false);
  });

  it.each([false, true])(
    "stops a %s-running player at a car side, then lets them continue once it leaves",
    (running) => {
      const traffic = oneCar(),
        contacts = createTrafficContacts();
      contacts.update(traffic, [
        {
          ...getVehicleTransforms(traffic)[0]!,
          position: { x: -30, y: 0, z: -30 },
          yawRadians: 0,
        },
      ]);
      let pose = { x: -35, z: -30, yaw: Math.PI / 2 };
      for (let index = 0; index < 100; index++) {
        pose = stepWalk(
          pose,
          pacedInput({ forward: 1, right: 0, turn: 0 }, running),
          0.2,
          [],
          contacts.canMove,
        );
        expect(contacts.canStand(pose)).toBe(true);
      }
      expect(pose.x).toBeLessThan(-31.525);
      contacts.update({ ...traffic, vehicles: [] });
      const next = stepWalk(
        pose,
        pacedInput({ forward: 1, right: 0, turn: 0 }, running),
        0.05,
        [],
        contacts.canMove,
      );
      expect(next.x).toBeGreaterThan(pose.x);
    },
  );

  it("allows small outward recovery from a pre-existing overlap, but never deeper travel or tunnelling", () => {
    const contacts = createTrafficContacts(),
      traffic = oneCar();
    contacts.update(traffic, [
      {
        ...getVehicleTransforms(traffic)[0]!,
        position: { x: -30, y: 0, z: -30 },
        yawRadians: 0,
      },
    ]);
    expect(contacts.canMove({ x: -31, z: -30 }, { x: -31.1, z: -30 })).toBe(
      true,
    );
    expect(contacts.canMove({ x: -31, z: -30 }, { x: -30.9, z: -30 })).toBe(
      false,
    );
    expect(contacts.canMove({ x: -31, z: -30 }, { x: -26, z: -30 })).toBe(
      false,
    );
  });

  it("waits for a player, emits a restrained horn, and resumes after they leave", () => {
    let traffic = oneCar();
    const horns = createTrafficHornController();
    const position = sampleLane(
      "clockwise",
      advanceRoadProgress(0.1, 15),
    ).position;
    const people = collectTrafficPeople([], [], {
      player: new Vector3(position.x, 2, position.z),
    });
    const cues: string[] = [];
    for (let frame = 0; frame < 240; frame++) {
      traffic = stepTraffic(traffic, 0.05, { pedestrians: people });
      const stopped = traffic.vehicles[0]!.speedMetersPerSecond < 0.15;
      const hazards = getTrafficPedestrianHazards(traffic, people).filter(
        (hazard) => stopped && hazard.distanceMeters <= 1.5,
      );
      cues.push(
        ...horns
          .update(
            0.05,
            hazards.map((hazard) => ({
              vehicleId: hazard.vehicleId,
              personId: hazard.personId,
              x: hazard.vehiclePosition.x,
              z: hazard.vehiclePosition.z,
              distance: 4,
            })),
          )
          .map((cue) => cue.message),
      );
    }
    expect(traffic.vehicles[0]!.speedMetersPerSecond).toBe(0);
    expect(cues.length).toBeGreaterThanOrEqual(1);
    expect(cues.length).toBeLessThanOrEqual(2);
    expect(cues[0]).toContain("pavement");
    const stoppedProgress = traffic.vehicles[0]!.progress;
    for (let frame = 0; frame < 60; frame++)
      traffic = stepTraffic(traffic, 0.05, { pedestrians: [] });
    expect(traffic.vehicles[0]!.progress).toBeGreaterThan(stoppedProgress);
    expect(traffic.vehicles[0]!.speedMetersPerSecond).toBeGreaterThan(4);
  });
});

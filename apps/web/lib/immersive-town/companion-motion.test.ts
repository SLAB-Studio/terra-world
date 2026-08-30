import { describe, it, expect } from "vitest";
import {
  createCompanionState,
  stepCompanion,
  heelPoint,
  clearCompanionPath,
} from "./companion-motion";
describe("LEO heel locomotion", () => {
  it.each([30, 60, 120])(
    "keeps pace during a long run, turns and settles (%s fps)",
    (fps) => {
      const p = { x: 0, z: 0, yaw: 0 },
        dog = createCompanionState(p, () => true);
      for (let i = 0; i < fps * 20; i++) {
        if (i > fps * 8 && i < fps * 10) p.yaw += 0.7 / fps;
        p.x += (Math.sin(p.yaw) * 3.6) / fps;
        p.z += (Math.cos(p.yaw) * 3.6) / fps;
        stepCompanion(dog, p, 1 / fps, () => true, 3.6);
        expect(Math.hypot(dog.x - p.x, dog.z - p.z)).toBeLessThan(1.6);
        expect(Math.hypot(dog.x - p.x, dog.z - p.z)).toBeGreaterThan(0.5);
      }
      for (let i = 0; i < fps * 3; i++)
        stepCompanion(dog, p, 1 / fps, () => true, 0);
      expect(
        Math.hypot(dog.x - heelPoint(p).x, dog.z - heelPoint(p).z),
      ).toBeLessThan(0.04);
      expect(dog.speed).toBe(0);
    },
  );
  it("keeps a stable right-hand position along a long walking route and settles when stopped", () => {
    const p = { x: 0, z: 0, yaw: 0 },
      dog = createCompanionState(p, () => true);
    for (let i = 0; i < 600; i++) {
      p.z += 1.8 / 60;
      stepCompanion(dog, p, 1 / 60, () => true);
    }
    expect(Math.abs(dog.x - 0.95)).toBeLessThan(0.06);
    expect(Math.hypot(dog.x - p.x, dog.z - p.z)).toBeLessThan(1.1);
    for (let i = 0; i < 180; i++) stepCompanion(dog, p, 1 / 60, () => true);
    expect(
      Math.hypot(dog.x - heelPoint(p).x, dog.z - heelPoint(p).z),
    ).toBeLessThan(0.03);
    expect(dog.speed).toBe(0);
  });
  it("walks around the player during a reversal without intersecting the body", () => {
    const p = { x: 0, z: 0, yaw: 0 },
      dog = createCompanionState(p, () => true);
    p.yaw = Math.PI;
    for (let i = 0; i < 600; i++) {
      stepCompanion(dog, p, 1 / 60, () => true);
      expect(Math.hypot(dog.x, dog.z)).toBeGreaterThan(0.5);
    }
    expect(
      Math.hypot(dog.x - heelPoint(p).x, dog.z - heelPoint(p).z),
    ).toBeLessThan(0.04);
  });
  it("goes single-file through a narrow opening, then rejoins at heel", () => {
    const allowed = (p: { x: number; z: number }) =>
      p.z < 2 || p.z > 5 || Math.abs(p.x) < 0.32;
    const p = { x: 0, z: 0, yaw: 0 },
      dog = createCompanionState(p, allowed);
    for (let i = 0; i < 600; i++) {
      p.z += 0.9 / 60;
      stepCompanion(dog, p, 1 / 60, allowed);
      expect(allowed(dog)).toBe(true);
    }
    for (let i = 0; i < 240; i++) stepCompanion(dog, p, 1 / 60, allowed);
    expect(
      Math.hypot(dog.x - heelPoint(p).x, dog.z - heelPoint(p).z),
    ).toBeLessThan(0.05);
  });
  it("sweeps the whole path and never teleports on a stalled frame", () => {
    expect(
      clearCompanionPath(
        { x: 0, z: 0 },
        { x: 2, z: 0 },
        (p) => p.x < 0.8 || p.x > 1.2,
      ),
    ).toBe(false);
    const p = { x: 0, z: 0, yaw: 0 },
      dog = createCompanionState(p, () => true),
      before = { ...dog };
    p.z = 10;
    stepCompanion(dog, p, 60, () => true);
    expect(Math.hypot(dog.x - before.x, dog.z - before.z)).toBeLessThan(0.16);
    const still = { ...dog };
    stepCompanion(dog, p, NaN, () => true);
    expect(dog).toEqual(still);
  });
});

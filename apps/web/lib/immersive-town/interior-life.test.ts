import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createInteriorLife } from "./interior-life";
import { homeLifePlan, venueLifePlan } from "./interior-life-plan";
import { TOWN_VENUES } from "./venue-catalog";
import { createInteriorDressing } from "./interior-dressing";
import { createHouseInteriorWorld } from "./house-interior-world";
import { createVenueWorld } from "./venue-world";
import { canWalkInside } from "./interior-navigation";

describe("lived-in interiors", () => {
  it("gives every advertised floor a bounded, place-specific cast without adding venues", () => {
    expect(TOWN_VENUES).toHaveLength(18);
    for (const venue of TOWN_VENUES)
      for (let floor = 0; floor < venue.floors.length; floor++) {
        const plan = venueLifePlan(venue, floor);
        expect(
          plan.people.length,
          `${venue.id}/${floor}`,
        ).toBeGreaterThanOrEqual(3);
        expect(plan.people.length).toBeLessThanOrEqual(6);
        expect(new Set(plan.people.map((p) => p.name)).size).toBe(
          plan.people.length,
        );
        for (const person of plan.people) {
          expect(person.name.toLowerCase()).not.toBe("leo");
          expect(person.lines.length).toBeGreaterThan(0);
          expect(Math.abs(person.x)).toBeGreaterThan(1.5);
          expect(Math.abs(person.x)).toBeLessThan(10.5);
          expect(Math.abs(person.z)).toBeLessThan(9);
        }
      }
    const family = homeLifePlan().people;
    expect(
      family.filter((p) => p.child && p.activity === "watch"),
    ).toHaveLength(2);
    expect(family.some((p) => p.activity === "cook")).toBe(true);
    const hub = TOWN_VENUES.find((v) => v.id === "hub")!;
    expect(venueLifePlan(hub, 0).use).toBe("bank");
    expect(
      venueLifePlan(hub, 0).people.some((p) => /Depositing/.test(p.role)),
    ).toBe(true);
    expect(
      venueLifePlan(hub, 1).people.filter((p) => p.activity === "type"),
    ).toHaveLength(4);
  });

  it("uses meal, repair and sample props instead of giving every task a book or kitchen spoon", () => {
    const plans = TOWN_VENUES.flatMap((venue) =>
      venue.floors.map((_, i) => venueLifePlan(venue, i)),
    );
    const diner = plans
      .find((p) => p.use === "cafe")!
      .people.find((p) => p.role === "Eating with family")!;
    expect(diner).toMatchObject({ activity: "eat", prop: "fork" });
    const repairers = plans
      .find((p) => p.use === "workshop")!
      .people.filter((p) => p.task);
    expect(repairers).toHaveLength(2);
    for (const repairer of repairers)
      expect(repairer).toMatchObject({
        activity: "repair",
        prop: "screwdriver",
      });
    const scientists = plans
      .find((p) => p.use === "science")!
      .people.filter((p) => p.task);
    for (const scientist of scientists)
      expect(scientist).toMatchObject({ activity: "inspect", prop: "sample" });
    for (const plan of [...plans, homeLifePlan()])
      for (const person of plan.people) {
        if (person.activity === "cook") expect(person.prop).toBe("spoon");
        if (person.activity === "type") expect(person.task).toBeDefined();
        if (person.activity === "chat") expect(person.task).toBeUndefined();
      }
  });

  it.each([
    ["home", "television-frame", "cooker-hob", "washing-machine"],
    ["bank", "bank-atm", "service-payment-terminal", "deposit-slip"],
    ["hub", "keyboard", "computer-mouse", "filing-cabinet"],
    ["apartments", "television-frame", "cooker-hob", "wardrobe"],
    ["cafe", "card-reader", "fresh-bread", "dinner-plate"],
    ["clinic", "sanitiser", "tissue-box", "keyboard"],
  ])(
    "batches detailed %s furnishings into ten static materials or fewer",
    (use, ...expected) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const dressing = createInteriorDressing(scene, use!);
        for (const name of expected) expect(dressing.fixtures).toContain(name);
        expect(dressing.root.metadata.staticBatches).toBeLessThanOrEqual(10);
        expect(dressing.root.getChildMeshes().length).toBeLessThanOrEqual(14);
        expect(
          dressing.root.getChildMeshes().every((mesh) => !mesh.isPickable),
        ).toBe(true);
        for (const obstacle of dressing.obstacles)
          expect(obstacle.minX > 1.25 || obstacle.maxX < -1.25).toBe(true);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it("preserves each home's upgrade effects, and powers the TV off and on with the home", () => {
    const engine = new NullEngine();
    const world = createHouseInteriorWorld(engine, "sunny", []);
    try {
      expect(world.life.people).toHaveLength(4);
      const child = homeLifePlan().people[0]!;
      expect(world.life.nearbyAt(child)?.text).toContain("no power");
      world.life.update(0.05, false);
      expect(world.scene.getMeshByName("saucepan-steam-0")?.isEnabled()).toBe(
        false,
      );
      world.setInstalled(["light"]);
      expect(world.life.nearbyAt(child)?.text).not.toContain("no power");
      world.life.update(0.05, false);
      expect(world.scene.getMeshByName("saucepan-steam-0")?.isEnabled()).toBe(
        true,
      );
      expect(world.life.nearbyAt({ x: 6, z: -3 })?.role).toBe(
        "Preparing dinner",
      );
      expect(world.life.nearbyAt({ x: 0.3, z: 3 })?.role).not.toBe(
        "Watching TV",
      );
    } finally {
      world.dispose();
      engine.dispose();
    }
  });

  it("does not advance frozen, reduced-motion or disposed interior scenes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let blocked = false;
    const life = createInteriorLife(scene, homeLifePlan(), () => blocked);
    const point = homeLifePlan().people[0]!;
    try {
      const before = life.nearbyAt(point);
      life.update(60); // A long frame is capped, never a catch-up animation jump.
      expect(life.nearbyAt(point)).toEqual(before);
      blocked = true;
      for (let i = 0; i < 200; i++) life.update(0.05);
      expect(life.nearbyAt(point)).toEqual(before);
      blocked = false;
      for (let i = 0; i < 200; i++) life.update(0.05, true);
      expect(life.nearbyAt(point)).toEqual(before);
      for (let i = 0; i < 150; i++) life.update(0.05, false);
      expect(life.nearbyAt(point)?.text).not.toBe(before?.text);
      scene.dispose();
      expect(() => life.update(1)).not.toThrow();
      expect(engine.scenes).toHaveLength(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("keeps the apartment maintenance desk reachable beside the waiting resident", () => {
    const engine = new NullEngine();
    try {
      for (const id of [
        "district-apartments-west",
        "district-apartments-east",
      ]) {
        const world = createVenueWorld(
          engine,
          TOWN_VENUES.find((v) => v.id === id)!,
          0,
          "night",
        );
        try {
          expect(canWalkInside({ x: -6, z: 0.6 }, world.obstacles)).toBe(true);
        } finally {
          world.dispose();
        }
      }
    } finally {
      engine.dispose();
    }
  });

  it("follows the current room and action instead of speaking from an empty chair", () => {
    const engine = new NullEngine();
    const world = createHouseInteriorWorld(engine, "bluebell", ["light"]);
    try {
      let foundVisit = false;
      for (let frame = 0; frame < 900; frame++) {
        world.life.update(0.05, false);
        const state = world.life.routines!.residents[0]!;
        if (state.phase !== "visiting") continue;
        const nearby = world.life.nearbyAt(state);
        expect(nearby).toEqual({ name: "Maya", role: state.label, text: "" });
        expect(world.life.people[0]!.rig.root.position.x).toBeCloseTo(state.x);
        expect(world.life.people[0]!.rig.root.position.z).toBeCloseTo(state.z);
        foundVisit = true;
        break;
      }
      expect(foundVisit).toBe(true);
    } finally {
      world.dispose();
      engine.dispose();
    }
  });
});

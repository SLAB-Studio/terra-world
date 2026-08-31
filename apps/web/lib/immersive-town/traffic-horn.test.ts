import { afterEach, describe, expect, it } from "vitest";
import {
  canPlayTrafficHorn,
  createTrafficHornController,
  publishTrafficHorn,
  setTrafficHornContext,
  subscribeTrafficHorn,
  subscribeTrafficHornContext,
  trafficHornVolume,
  type TrafficBlockage,
  type TrafficHornContext,
  type TrafficHornCue,
} from "./traffic-horn";

const blockage: TrafficBlockage = {
  vehicleId: "car-1",
  personId: "player-rivergate",
  x: 2,
  z: 3,
  distance: 5,
};
function advance(
  controller: ReturnType<typeof createTrafficHornController>,
  seconds: number,
  blocks: readonly TrafficBlockage[] = [blockage],
  context: TrafficHornContext = {},
) {
  const cues: TrafficHornCue[] = [];
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.1)
    cues.push(...controller.update(Math.min(0.1, remaining), blocks, context));
  return cues;
}

afterEach(() => setTrafficHornContext({ paused: true }));

describe("actual blocked-car horn timing", () => {
  it("warns the player when Leo is closest to the waiting car", () => {
    const [cue] = advance(createTrafficHornController(), 1.5, [
      { ...blockage, personId: "leo-dog" },
    ]);
    expect(cue?.playerBlocked).toBe(true);
    expect(cue?.message).toContain("you and Leo");
  });
  it("waits for a sustained stop, then carries positional and accessible feedback", () => {
    const controller = createTrafficHornController();
    expect(advance(controller, 1.4)).toEqual([]);
    const [cue] = advance(controller, 0.1);
    expect(cue).toMatchObject({ ...blockage, playerBlocked: true });
    expect(cue!.message).toContain("waiting for you");
    expect(cue!.volume).toBe(trafficHornVolume(5));
  });

  it("does not count separate crossings or changing blocking people as one stop", () => {
    const controller = createTrafficHornController();
    expect(advance(controller, 1)).toEqual([]);
    expect(advance(controller, 0.1, [])).toEqual([]);
    expect(advance(controller, 1)).toEqual([]);
    expect(
      advance(controller, 1.4, [{ ...blockage, personId: "resident" }]),
    ).toEqual([]);
    const [cue] = advance(controller, 0.1, [
      { ...blockage, personId: "resident" },
    ]);
    expect(cue!.playerBlocked).toBe(false);
    expect(cue!.message).not.toContain("you");
  });

  it("keeps an eight-second per-car cooldown through short unblocks", () => {
    const controller = createTrafficHornController();
    expect(advance(controller, 1.5)).toHaveLength(1);
    expect(advance(controller, 0.2, [])).toEqual([]);
    expect(advance(controller, 7.7)).toEqual([]);
    expect(advance(controller, 0.1)).toHaveLength(1);
  });

  it("spaces different cars globally and gives the player obstruction first turn", () => {
    const controller = createTrafficHornController();
    const blocks = [
      { ...blockage, vehicleId: "car-2", personId: "npc", distance: 1 },
      blockage,
    ];
    expect(
      advance(controller, 1.5, blocks).map((cue) => cue.vehicleId),
    ).toEqual(["car-1"]);
    expect(advance(controller, 2.4, blocks)).toEqual([]);
    expect(
      advance(controller, 0.1, blocks).map((cue) => cue.vehicleId),
    ).toEqual(["car-2"]);
  });

  it.each([{ paused: true }, { inside: true }, { hidden: true }])(
    "clears sustained-block timing and freezes cooldown in inactive context %j",
    (context) => {
      const controller = createTrafficHornController();
      advance(controller, 1);
      expect(controller.update(100, [blockage], context)).toEqual([]);
      expect(advance(controller, 1.4)).toEqual([]);
      expect(advance(controller, 0.1)).toHaveLength(1);
      controller.update(100, [blockage], context);
      expect(advance(controller, 7.9)).toEqual([]);
      expect(advance(controller, 0.1)).toHaveLength(1);
    },
  );

  it("rejects invalid inputs and never turns a stalled frame into instant honking", () => {
    const controller = createTrafficHornController();
    for (const delta of [NaN, Infinity, -2, 0])
      expect(controller.update(delta, [blockage])).toEqual([]);
    expect(controller.update(100, [blockage])).toEqual([]);
    expect(advance(controller, 1.2)).toEqual([]);
    expect(advance(controller, 0.05)).toHaveLength(1);
    controller.reset();
    for (const bad of [
      { ...blockage, x: NaN },
      { ...blockage, distance: -1 },
      { ...blockage, vehicleId: "" },
    ])
      expect(advance(controller, 2, [bad])).toEqual([]);
  });

  it("resets all scene-owned timing on teardown without creating a delayed cue", () => {
    const controller = createTrafficHornController();
    expect(advance(controller, 1.5)).toHaveLength(1);
    controller.reset();
    expect(advance(controller, 1.4)).toEqual([]);
    expect(advance(controller, 0.1)).toHaveLength(1);
  });

  it("attenuates nearby horns and ignores distant traffic without stealing cooldown", () => {
    expect(trafficHornVolume(0)).toBe(0.01);
    expect(trafficHornVolume(5)).toBeGreaterThan(trafficHornVolume(25));
    for (const distance of [55, 500, NaN, Infinity, -1])
      expect(trafficHornVolume(distance)).toBe(0);
    const controller = createTrafficHornController();
    expect(advance(controller, 20, [{ ...blockage, distance: 100 }])).toEqual(
      [],
    );
    expect(advance(controller, 1.5)).toHaveLength(1);
  });

  it("never spams across sustained multi-car obstruction", () => {
    const controller = createTrafficHornController();
    const blocks = Array.from({ length: 5 }, (_, i) => ({
      ...blockage,
      vehicleId: `car-${i}`,
      personId: "npc",
    }));
    let lastGlobal = -Infinity;
    const perCar = new Map<string, number>();
    for (let step = 1; step <= 600; step++) {
      const cues = controller.update(0.1, blocks);
      expect(cues.length).toBeLessThanOrEqual(1);
      for (const cue of cues) {
        expect(step / 10 - lastGlobal).toBeGreaterThanOrEqual(2.5 - 1e-8);
        expect(
          step / 10 - (perCar.get(cue.vehicleId) ?? -Infinity),
        ).toBeGreaterThanOrEqual(8 - 1e-8);
        lastGlobal = step / 10;
        perCar.set(cue.vehicleId, lastGlobal);
      }
    }
    expect(perCar.size).toBeGreaterThan(1);
  });
});

describe("soundscape gate and accessible cue bridge", () => {
  it("requires sound-on, an unlocked visible outdoor city and active simulation", () => {
    const ready = {
      muted: false,
      visible: true,
      audioReady: true,
      mode: "town" as const,
      context: {},
    };
    expect(canPlayTrafficHorn(ready)).toBe(true);
    for (const changed of [
      { muted: true },
      { visible: false },
      { audioReady: false },
      { mode: "welcome" as const },
      { context: { paused: true } },
      { context: { inside: true } },
      { context: { hidden: true } },
    ])
      expect(canPlayTrafficHorn({ ...ready, ...changed })).toBe(false);
  });

  it("supports unsubscribing, immediate pause cancellation and a sound-independent HUD", () => {
    setTrafficHornContext({ paused: true });
    const cues: TrafficHornCue[] = [];
    const states: TrafficHornContext[] = [];
    const offCue = subscribeTrafficHorn((cue) => cues.push(cue));
    const offContext = subscribeTrafficHornContext((context) =>
      states.push(context),
    );
    const cue = advance(createTrafficHornController(), 1.5)[0]!;
    try {
      expect(states).toEqual([{ paused: true }]);
      publishTrafficHorn(cue);
      expect(cues).toEqual([]);
      setTrafficHornContext({});
      publishTrafficHorn(cue); // Muting is audio-only; this still reaches the HUD.
      expect(cues).toEqual([cue]);
      setTrafficHornContext({ inside: true });
      publishTrafficHorn(cue);
      expect(cues).toHaveLength(1);
      expect(states.at(-1)).toEqual({ inside: true });
      offCue();
      offContext();
      setTrafficHornContext({});
      publishTrafficHorn(cue);
      expect(cues).toHaveLength(1);
      expect(states).toHaveLength(3);
    } finally {
      offCue();
      offContext();
    }
  });
});

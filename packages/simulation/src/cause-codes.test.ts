import { describe, expect, expectTypeOf, it } from "vitest";

import {
  eventCauseCode,
  milestoneCauseCode,
  RUNTIME_STATIC_CAUSE_CODES,
  stageTransitionCauseCode,
  type EventCauseCode,
  type MilestoneCauseCode,
  type RuntimeStaticCauseCode,
  type StageTransitionCauseCode,
} from "./cause-codes";

describe("runtime cause-code registry", () => {
  it("contains unique, stable static codes", () => {
    expect(new Set(RUNTIME_STATIC_CAUSE_CODES).size).toBe(
      RUNTIME_STATIC_CAUSE_CODES.length,
    );
    expect([...RUNTIME_STATIC_CAUSE_CODES].sort()).toEqual(
      [...RUNTIME_STATIC_CAUSE_CODES].sort(),
    );
    expectTypeOf<
      (typeof RUNTIME_STATIC_CAUSE_CODES)[number]
    >().toEqualTypeOf<RuntimeStaticCauseCode>();
  });

  it("builds typed dynamic event and milestone codes", () => {
    const event = eventCauseCode("river-rain");
    const milestone = milestoneCauseCode("water-ready");

    expect(event).toBe("event.river-rain");
    expect(milestone).toBe("milestone.water-ready");
    expectTypeOf(event).toEqualTypeOf<EventCauseCode<"river-rain">>();
    expectTypeOf(milestone).toEqualTypeOf<MilestoneCauseCode<"water-ready">>();
  });

  it("builds a typed stage-transition code", () => {
    const transition = stageTransitionCauseCode("town", "city");

    expect(transition).toBe("stage.town-to-city");
    expectTypeOf(transition).toEqualTypeOf<
      StageTransitionCauseCode<"town", "city">
    >();
  });
});

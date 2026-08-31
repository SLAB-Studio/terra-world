import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import MissionMinimap, { type MissionMinimapProps } from "./MissionMinimap";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const defaults: MissionMinimapProps = {
  geometry: {
    bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
    road: [
      { x: -50, z: 0 },
      { x: 50, z: 0 },
    ],
    river: [
      { x: 10, z: -80 },
      { x: 10, z: 80 },
    ],
    buildings: [
      { id: "bakery", position: { x: 20, z: 20 }, width: 6, depth: 8 },
    ],
  },
  pose: { x: 0, z: 0, yaw: Math.PI / 2 },
  target: {
    id: "bridge",
    label: "East Bridge",
    instruction: "Read the closure notice at East Bridge.",
    position: { x: 30, z: 40 },
    radius: 5,
  },
  mode: "walk",
  timeOfDay: "night",
};

function render(extra: Partial<MissionMinimapProps> = {}) {
  return renderToStaticMarkup(
    createElement(MissionMinimap, { ...defaults, ...extra }),
  );
}

describe("mission minimap", () => {
  it("shows a semantic north-up city map, mission pin, heading and honest distance", () => {
    const html = render();
    expect(html).toContain('aria-label="Mission navigation"');
    expect(html).toContain('aria-label="Collapse mission map"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="img"');
    expect(html).toContain("North is up.");
    expect(html).toContain('data-map-marker="mission"');
    expect(html).toContain('data-map-marker="player"');
    expect(html).toContain("You, facing E");
    expect(html).toContain("50 m away");
    expect(html).toContain("Straight-line distance, not a walking route");
    expect(html).toContain("Read the closure notice at East Bridge.");
    expect(html).toContain("NE");
  });

  it("switches to Nearby at the actual mission interaction radius", () => {
    const html = render({ pose: { x: 27, z: 36, yaw: 0 } });
    expect(html).toContain("Nearby");
    expect(html).not.toContain("m away");
    expect(html).toContain("Read the closure notice at East Bridge.");
  });

  it("retains the objective when collapsed without displaying the map", () => {
    const html = render({ initiallyCollapsed: true });
    expect(html).toContain('aria-label="Expand mission map"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).not.toContain('role="img"');
    expect(html).toContain("East Bridge");
    expect(html).toContain("50 m away");
  });

  it("never invents a destination when no objective is pinned", () => {
    const html = render({ target: null });
    expect(html).toContain("No pinned mission");
    expect(html).toContain("Review your notebook.");
    expect(html).not.toContain('data-map-marker="mission"');
    expect(html).not.toContain("m away");
  });

  it("uses the supplied no-destination status", () => {
    expect(
      render({ target: null, status: "Choose your next investigation." }),
    ).toContain("Choose your next investigation.");
  });

  it("keeps indoor navigation explicitly on the street without fake indoor distance", () => {
    const html = render({ mode: "indoors" });
    expect(html).toContain("Exit building to continue.");
    expect(html).toContain("Entrance, facing E");
    expect(html).toContain("Street map");
    expect(html).not.toContain("m away");
  });

  it("shows the actual indoor next step when supplied", () => {
    const html = render({
      mode: "indoors",
      status: "Inspect the kitchen before leaving.",
    });
    expect(html).toContain("Inspect the kitchen before leaving.");
    expect(html).not.toContain("Exit building to continue.");
    expect(html).not.toContain("Read the closure notice at East Bridge.");
  });

  it("does not draw an invalid or not-yet-ready player at a made-up position", () => {
    for (const pose of [null, { x: Number.NaN, z: 0, yaw: 0 }]) {
      const html = render({ pose });
      expect(html).not.toContain('data-map-marker="player"');
      expect(html).not.toContain("m away");
      expect(html).toContain('data-map-marker="mission"');
      expect(html).not.toContain("NaN");
    }
  });

  it("treats a runtime null pose as absent, not as the stale fallback pose", () => {
    const html = render({ readPose: () => null });
    expect(html).not.toContain('data-map-marker="player"');
    expect(html).not.toContain("50 m away");
  });

  it("labels the aerial map's marker as a street position", () => {
    expect(render({ mode: "town" })).toContain("Street position, facing E");
  });

  it("marks the actual closure without claiming the bearing is a safe route", () => {
    const html = render({ closedCrossing: { x: 12, z: 40 } });
    expect(html).toContain("East Bridge closed — use the south crossing");
    expect(html).toContain("Direction to mission, not a walking route");
  });
});

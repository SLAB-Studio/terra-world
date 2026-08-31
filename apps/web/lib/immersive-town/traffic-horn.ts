/** Traffic-local feedback: no timers, storage, DOM events or AI requests. */
export type TrafficBlockage = Readonly<{
  vehicleId: string;
  personId: string;
  x: number;
  z: number;
  distance: number;
}>;

export type TrafficHornCue = TrafficBlockage &
  Readonly<{
    volume: number;
    playerBlocked: boolean;
    message: string;
  }>;

export type TrafficHornContext = Readonly<{
  paused?: boolean;
  inside?: boolean;
  hidden?: boolean;
}>;

const active = (context: TrafficHornContext) =>
  !context.paused && !context.inside && !context.hidden;
const belongsToPlayer = (id: string) =>
  id === "player-rivergate" || id === "leo-dog";

/** Absolute gain for one horn partial; out-of-range cars never use the cooldown. */
export function trafficHornVolume(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0 || distance >= 55) return 0;
  return 0.01 * Math.pow(1 - distance / 55, 1.5);
}

export function canPlayTrafficHorn(
  options: Readonly<{
    muted: boolean;
    visible: boolean;
    audioReady: boolean;
    mode: "welcome" | "town";
    context: TrafficHornContext;
  }>,
): boolean {
  return (
    !options.muted &&
    options.visible &&
    options.audioReady &&
    options.mode === "town" &&
    active(options.context)
  );
}

function validBlockage(blockage: TrafficBlockage): boolean {
  return (
    !!blockage.vehicleId &&
    !!blockage.personId &&
    Number.isFinite(blockage.x) &&
    Number.isFinite(blockage.z) &&
    trafficHornVolume(blockage.distance) > 0
  );
}

/** Feed actual stationary vehicle/person conflicts once per simulation frame. */
export function createTrafficHornController() {
  const blocked = new Map<string, { personId: string; duration: number }>();
  const lastVehicleHorn = new Map<string, number>();
  let elapsed = 0;
  let lastHorn = -Infinity;
  return {
    update(
      deltaSeconds: number,
      blockages: readonly TrafficBlockage[],
      context: TrafficHornContext = {},
    ): readonly TrafficHornCue[] {
      if (!active(context)) {
        // Resume requires a fresh sustained obstruction, not a delayed beep.
        blocked.clear();
        return [];
      }
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return [];
      // A hidden-tab / stalled frame must not count as seconds of observation.
      elapsed += Math.min(deltaSeconds, 0.25);
      const dt = Math.min(deltaSeconds, 0.25);
      const current = new Map(
        blockages
          .filter(validBlockage)
          .map((blockage) => [blockage.vehicleId, blockage]),
      );
      for (const id of blocked.keys()) if (!current.has(id)) blocked.delete(id);
      for (const [id, time] of lastVehicleHorn)
        if (!current.has(id) && elapsed - time >= 8) lastVehicleHorn.delete(id);
      for (const [id, blockage] of current) {
        const previous = blocked.get(id);
        blocked.set(id, {
          personId: blockage.personId,
          duration:
            (previous?.personId === blockage.personId ? previous.duration : 0) +
            dt,
        });
      }
      if (elapsed - lastHorn < 2.5 - 1e-8) return [];
      const candidate = [...current.values()]
        .filter(
          (blockage) =>
            blocked.get(blockage.vehicleId)!.duration >= 1.5 - 1e-8 &&
            elapsed - (lastVehicleHorn.get(blockage.vehicleId) ?? -Infinity) >=
              8 - 1e-8,
        )
        .sort(
          (a, b) =>
            Number(belongsToPlayer(b.personId)) -
              Number(belongsToPlayer(a.personId)) ||
            a.distance - b.distance ||
            a.vehicleId.localeCompare(b.vehicleId),
        )[0];
      if (!candidate) return [];
      lastHorn = elapsed;
      lastVehicleHorn.set(candidate.vehicleId, elapsed);
      const playerBlocked = belongsToPlayer(candidate.personId);
      return [
        {
          ...candidate,
          volume: trafficHornVolume(candidate.distance),
          playerBlocked,
          message:
            candidate.personId === "leo-dog"
              ? "A driver is waiting for you and Leo. Move onto the pavement together."
              : playerBlocked
                ? "A driver is waiting for you. Please move onto the pavement."
                : "A driver is waiting for someone to cross.",
        },
      ];
    },
    reset() {
      blocked.clear();
      lastVehicleHorn.clear();
      elapsed = 0;
      lastHorn = -Infinity;
    },
  };
}

// One page-local bridge shared by the active city, soundscape and accessible HUD.
// The city owns context and must mark it paused on teardown.
let context: TrafficHornContext = { paused: true };
const cueListeners = new Set<(cue: TrafficHornCue) => void>();
const contextListeners = new Set<(context: TrafficHornContext) => void>();

export function setTrafficHornContext(next: TrafficHornContext): void {
  context = { ...next };
  contextListeners.forEach((listener) => listener(context));
}

export function subscribeTrafficHornContext(
  listener: (context: TrafficHornContext) => void,
): () => void {
  contextListeners.add(listener);
  listener(context);
  return () => {
    contextListeners.delete(listener);
  };
}

export function publishTrafficHorn(cue: TrafficHornCue): void {
  if (
    !active(context) ||
    !validBlockage(cue) ||
    cue.volume <= 0 ||
    !Number.isFinite(cue.volume)
  )
    return;
  cueListeners.forEach((listener) => listener(cue));
}

export function subscribeTrafficHorn(
  listener: (cue: TrafficHornCue) => void,
): () => void {
  cueListeners.add(listener);
  return () => {
    cueListeners.delete(listener);
  };
}

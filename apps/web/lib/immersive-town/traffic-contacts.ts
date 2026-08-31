import {
  getVehicleTransforms,
  type TrafficSimulation,
  type VehicleTransform,
} from "./traffic";
import {
  getTrafficVehicleFootprint,
  vehicleFootprintIntersectsCapsule,
  vehicleFootprintPointClearance,
  type TrafficPedestrian,
  type TrafficPoint,
  type TrafficVehicleFootprint,
} from "./traffic-pedestrians";

type ResidentBody = TrafficPoint &
  Readonly<{
    id: string;
    mode: string;
    ride?: Readonly<{ vehicleId: string }> | null;
  }>;

/** Scene ownership is explicit: indoor residents and seated passengers aren't
 * bodies on the road. Boarding excludes only that person's reserved car. */
export function collectTrafficPeople(
  residents: readonly ResidentBody[],
  bystanders: readonly TrafficPedestrian[],
  party?: Readonly<{ player: TrafficPoint; dog?: TrafficPoint }> | null,
): readonly TrafficPedestrian[] {
  const ids = new Set(residents.map((resident) => resident.id));
  const people: TrafficPedestrian[] = residents
    .filter(
      (resident) => !["inside", "seated", "riding"].includes(resident.mode),
    )
    .map((resident) => ({
      id: resident.id,
      x: resident.x,
      z: resident.z,
      radius: 0.4,
      ...(["boarding", "alighting"].includes(resident.mode) && resident.ride
        ? { ignoreVehicleId: resident.ride.vehicleId }
        : {}),
    }));
  for (const person of bystanders) {
    if (ids.has(person.id)) continue;
    ids.add(person.id);
    people.push(person);
  }
  if (party) {
    // Babylon Vector3 exposes x/z through accessors, not spreadable own keys.
    people.push({
      x: party.player.x,
      z: party.player.z,
      id: "player-rivergate",
      radius: 0.4,
    });
    if (party.dog)
      people.push({
        x: party.dog.x,
        z: party.dog.z,
        id: "leo-dog",
        radius: 0.75,
      });
  }
  return people;
}

/** Shared rendered car bodies for the foot controller and Leo. No mesh picking
 * or physics engine allocation is needed per movement micro-step. */
export function createTrafficContacts() {
  let footprints: readonly TrafficVehicleFootprint[] = [];
  return {
    update(
      simulation: TrafficSimulation,
      transforms = getVehicleTransforms(simulation),
    ) {
      const poses = new Map<string, VehicleTransform>(
        transforms.map((pose) => [pose.id, pose]),
      );
      footprints = simulation.vehicles.map((vehicle) =>
        getTrafficVehicleFootprint(vehicle, poses.get(vehicle.id)),
      );
    },
    canStand(point: TrafficPoint, radius = 0.4) {
      return footprints.every(
        (body) =>
          !vehicleFootprintIntersectsCapsule(body, point, point, radius),
      );
    },
    canMove(from: TrafficPoint, to: TrafficPoint, radius = 0.4) {
      return footprints.every((body) => {
        const start = vehicleFootprintPointClearance(body, from, radius);
        // Recover from an old save or a newly enabled camera already overlapping
        // a car. Only a small step outwards is allowed, never through its body.
        if (start < 0 && Math.hypot(to.x - from.x, to.z - from.z) <= 0.15) {
          return (
            vehicleFootprintPointClearance(body, to, radius) > start + 1e-8
          );
        }
        return !vehicleFootprintIntersectsCapsule(body, from, to, radius);
      });
    },
  };
}

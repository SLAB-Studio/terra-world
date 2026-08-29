export type NeighborhoodNeed = "light" | "water" | "garden" | "recycle";

export type NeighborhoodHomeProfile = Readonly<{
  id: string;
  displayName: string;
  ownerName: string;
  homeName: string;
  need: NeighborhoodNeed;
  problem: string;
  healthy: string;
}>;

const NEED_COPY: Readonly<
  Record<NeighborhoodNeed, Readonly<{ problem: string; healthy: string }>>
> = {
  light: {
    problem: "Our reading corner gets too dark when the sun goes down.",
    healthy: "Now our evening reading corner glows with clean sunlight power!",
  },
  water: {
    problem: "The kitchen tap sputters and our plants are getting thirsty.",
    healthy: "Clean water now reaches both our tap and our plants.",
  },
  garden: {
    problem:
      "Our bare yard needs a living place for food, flowers, and insects.",
    healthy: "The new garden is already welcoming plants and tiny neighbours.",
  },
  recycle: {
    problem: "Paper, cans, and rubbish are getting mixed together in our yard.",
    healthy:
      "Everything has a sorting place, and useful things can be used again.",
  },
};

const HOME_NAMES = [
  ["Zara", "Maple Home"],
  ["Kojo", "Coral Home"],
  ["Amara", "Palm Home"],
  ["Noah", "Pebble Home"],
  ["Lina", "Willow Home"],
  ["Musa", "Cedar Home"],
  ["Ada", "Daisy Home"],
  ["Theo", "Harbour Home"],
  ["Sade", "Acacia Home"],
  ["Ife", "Meadow Home"],
  ["Maya", "Hilltop Home"],
  ["Eli", "Pine Home"],
  ["Nia", "Sunbird Home"],
  ["Tayo", "Brook Home"],
  ["Ola", "Orchid Home"],
  ["Sam", "Juniper Home"],
  ["Ari", "Lagoon Home"],
  ["Kemi", "Mango Leaf Home"],
  ["Ben", "Fern Home"],
  ["Lola", "Honeybee Home"],
  ["Ravi", "Bamboo Home"],
  ["Amina", "Rainbow Home"],
  ["Jude", "Olive Home"],
  ["Mira", "West River Apartments"],
  ["Dayo", "East River Apartments"],
] as const;

const DETAIL_IDS = Array.from(
  { length: 10 },
  (_, index) => `neighborhood-home-${index}`,
);

const DISTRICT_IDS = [
  "south-west-1",
  "south-west-2",
  "south-west-3",
  "south-west-4",
  "south-west-5",
  "south-east-1",
  "south-east-2",
  "south-east-3",
  "south-east-4",
  "north-west-infill",
  "north-centre-west",
  "north-centre-east",
  "north-east-infill",
].map((id) => `district-home-${id}`);

const APARTMENT_IDS = ["district-apartments-west", "district-apartments-east"];

const ALL_IDS = [...DETAIL_IDS, ...DISTRICT_IDS, ...APARTMENT_IDS] as const;
const NEEDS: readonly NeighborhoodNeed[] = [
  "light",
  "water",
  "garden",
  "recycle",
];

export const NEIGHBORHOOD_HOME_PROFILES: readonly NeighborhoodHomeProfile[] =
  ALL_IDS.map((id, index) => {
    const [ownerName, homeName] = HOME_NAMES[index] ?? [
      "A neighbour",
      "Rivergate Home",
    ];
    const need = NEEDS[index % NEEDS.length] ?? "light";
    const copy = NEED_COPY[need];
    return {
      id,
      displayName: `${ownerName}'s ${homeName}`,
      ownerName,
      homeName,
      need,
      problem: copy.problem,
      healthy: copy.healthy,
    };
  });

export const TOWN_DETAIL_HOME_PROFILES = NEIGHBORHOOD_HOME_PROFILES.slice(
  0,
  DETAIL_IDS.length,
);

export function neighborhoodHomeProfile(
  id: string,
  displayName?: string,
): NeighborhoodHomeProfile {
  const profile = NEIGHBORHOOD_HOME_PROFILES.find((home) => home.id === id);
  if (profile !== undefined) return profile;
  const need = NEEDS[stableIndex(id) % NEEDS.length] ?? "light";
  const copy = NEED_COPY[need];
  return {
    id,
    displayName: displayName ?? "A Rivergate home",
    ownerName: "Your neighbour",
    homeName: displayName ?? "Rivergate Home",
    need,
    problem: copy.problem,
    healthy: copy.healthy,
  };
}

export function startingNeighborhoodUpgrades(
  need: NeighborhoodNeed,
): readonly NeighborhoodNeed[] {
  return NEEDS.filter((upgrade) => upgrade !== need);
}

function stableIndex(value: string): number {
  return [...value].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
}

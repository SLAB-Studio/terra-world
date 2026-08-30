/** Serializable destination data. Keep Babylon out of the accessible directory. */
export type VenueKind =
  | "library"
  | "science"
  | "studios"
  | "hub"
  | "bookshop"
  | "arts"
  | "cafe"
  | "workshop"
  | "school"
  | "clinic"
  | "apartments"
  | "market"
  | "playground"
  | "bus"
  | "dock";
export type VenueFloor = Readonly<{
  label: string;
  use: VenueKind | "lobby" | "roof" | "bank";
}>;
export type TownVenue = Readonly<{
  id: string;
  name: string;
  kind: VenueKind;
  rootName: string;
  doorZ: number;
  description: string;
  floors: readonly VenueFloor[];
  outdoor?: boolean;
}>;

const tower = (
  id: VenueKind,
  name: string,
  height: number,
  description: string,
  roomName: string,
): TownVenue => ({
  id,
  name,
  kind: id,
  rootName: `downtown-${id}`,
  doorZ: -4.2,
  description,
  floors: [
    {
      label:
        id === "hub" ? "Ground · Banking & city services" : "Ground · Welcome",
      use: id === "hub" ? "bank" : "lobby",
    },
    ...Array.from({ length: Math.floor((height - 3.5) / 2.8) }, (_, i) => ({
      label: `${i + 1} · ${roomName}`,
      use: id,
    })),
    { label: "Roof · Sky garden", use: "roof" },
  ],
});

export const TOWN_VENUES: readonly TownVenue[] = [
  tower(
    "library",
    "City Library",
    15,
    "Find a quiet reading corner, explore the bookshelves and discover how stories are shared.",
    "Library & reading room",
  ),
  tower(
    "science",
    "Science Centre",
    27,
    "Explore the laboratory benches, microscopes and colourful planet models.",
    "Discovery lab",
  ),
  tower(
    "studios",
    "River Studios",
    20,
    "Step behind the microphone and explore the mixing desk and recording area.",
    "Recording studio",
  ),
  tower(
    "hub",
    "City Hub",
    31,
    "Visit the banking and city-service counters downstairs, then explore Rivergate’s offices and shared workspaces.",
    "Town offices",
  ),
  tower(
    "bookshop",
    "Books & Stories",
    14,
    "Browse colourful books and visit the storytelling corner.",
    "Bookshop & reading room",
  ),
  tower(
    "arts",
    "Arts Centre",
    22,
    "Wander through the gallery and discover paintings and sculptures.",
    "Art & sculpture gallery",
  ),
  tower(
    "cafe",
    "Sunshine Cafe",
    13,
    "Pull up a chair in the cafe and explore the counter and dining spaces.",
    "Cafe & bakery",
  ),
  tower(
    "workshop",
    "Makers Market",
    18,
    "Explore the workbenches and learn how things can be repaired and reused.",
    "Repair workshop",
  ),
  {
    id: "school",
    name: "Rivergate School",
    kind: "school",
    rootName: "rivergate-school",
    doorZ: -6.2,
    description:
      "Walk between the classroom desks, learning displays and reading corner.",
    floors: [{ label: "Ground · Classrooms", use: "school" }],
  },
  {
    id: "clinic",
    name: "Community Clinic",
    kind: "clinic",
    rootName: "rivergate-clinic",
    doorZ: -4.3,
    description:
      "Find the reception, waiting area and private examination spaces.",
    floors: [{ label: "Ground · Reception & care", use: "clinic" }],
  },
  ...["west", "east"].map((side): TownVenue => ({
    id: `district-apartments-${side}`,
    name: `${side === "west" ? "West" : "East"} River Apartments`,
    kind: "apartments",
    rootName: `district-apartments-${side}`,
    doorZ: -4.2,
    description:
      "Meet the neighbours in the lobby, then take the lift to the furnished apartments.",
    floors: [
      { label: "Ground · Lobby & mailboxes", use: "lobby" },
      { label: "1 · Family apartments", use: "apartments" },
      { label: "2 · Family apartments", use: "apartments" },
      { label: "Roof · Residents’ terrace", use: "roof" },
    ],
  })),
  {
    id: "market",
    name: "Riverside Market",
    kind: "market",
    rootName: "rivergate-market",
    doorZ: -4,
    outdoor: true,
    description:
      "Explore the open-air stalls. Local food travels a shorter distance from farm to plate.",
    floors: [{ label: "Market square", use: "market" }],
  },
  {
    id: "playground",
    name: "Community Playground",
    kind: "playground",
    rootName: "rivergate-playground",
    doorZ: -6,
    outdoor: true,
    description:
      "Explore the play area, planted edges and picnic tables. Keep a clear path for everyone.",
    floors: [{ label: "Playground", use: "playground" }],
  },
  ...[0, 1, 2].map((i): TownVenue => ({
    id: `bus-${i}`,
    name: `Bus stop ${i + 1}`,
    kind: "bus",
    rootName: `bus-stop-${i}`,
    doorZ: -2,
    outdoor: true,
    description:
      "Wait inside the shelter and read the route board. Sharing a bus means fewer cars on the road.",
    floors: [{ label: "Bus shelter", use: "bus" }],
  })),
  {
    id: "dock",
    name: "Community Dock",
    kind: "dock",
    rootName: "rivergate-community-dock",
    doorZ: -3.8,
    outdoor: true,
    description:
      "Explore the riverside deck behind the safety rails and watch the water.",
    floors: [{ label: "Riverside deck", use: "dock" }],
  },
];

export const findTownVenue = (id: string) =>
  TOWN_VENUES.find((venue) => venue.id === id);

export function venueFloorDescription(venue: TownVenue, index: number): string {
  const floor = venue.floors[index];
  if (floor?.use === "bank")
    return "Watch tellers help residents with deposits and service payments. These are fictional background activities, not real transactions. Take the lift upstairs for the offices.";
  if (floor?.use === "roof")
    return "Explore the open-air terrace, planted corners and seating. Stay behind the safety rails, then take the lift back downstairs.";
  if (venue.kind === "apartments")
    return floor?.use === "lobby"
      ? "Explore the reception, mailboxes and shared seating. Take the lift to visit a furnished apartment."
      : "Walk along the entrance hall to the living room, bedroom, dining area and kitchen.";
  if (venue.kind === "hub" && floor?.use === "lobby")
    return "Explore City Hub’s reception and waiting area. Take the lift upstairs to visit the town offices.";
  return venue.description;
}

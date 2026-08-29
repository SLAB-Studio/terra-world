export const CHALLENGE_HOUSE_IDS = ["sunny", "bluebell", "mango"] as const;
export const CHALLENGE_UPGRADE_IDS = [
  "light",
  "water",
  "garden",
  "recycle",
] as const;
export const CHALLENGE_PROGRESS_STORAGE_KEY =
  "terra-world-challenge-progress-v1";

export type ChallengeHouseId = (typeof CHALLENGE_HOUSE_IDS)[number];
export type ChallengeUpgradeId = (typeof CHALLENGE_UPGRADE_IDS)[number];
export type ChallengeDifficulty =
  "Starter" | "Explorer" | "Planner" | "Rescuer" | "Guardian";

export type ChallengeSetup = Readonly<
  Record<ChallengeHouseId, readonly ChallengeUpgradeId[]>
>;

export type ChallengeGoal =
  | Readonly<{
      id: string;
      type: "house-has";
      label: string;
      houseId: ChallengeHouseId;
      upgradeId: ChallengeUpgradeId;
    }>
  | Readonly<{
      id: string;
      type: "house-healthy";
      label: string;
      houseId: ChallengeHouseId;
    }>
  | Readonly<{
      id: string;
      type: "all-houses-have";
      label: string;
      upgradeId: ChallengeUpgradeId;
    }>
  | Readonly<{
      id: string;
      type: "healthy-house-count";
      label: string;
      count: number;
    }>
  | Readonly<{
      id: string;
      type: "each-house-upgrade-count";
      label: string;
      count: number;
    }>;

export type TerraChallenge = Readonly<{
  id: string;
  stage: 1 | 2 | 3 | 4 | 5;
  order: number;
  title: string;
  story: string;
  instruction: string;
  learning: string;
  difficulty: ChallengeDifficulty;
  parMoves: number;
  concepts: readonly string[];
  setup: ChallengeSetup;
  goals: readonly ChallengeGoal[];
  hints: readonly [string, string, string];
}>;

export type ChallengeStage = Readonly<{
  id: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle: string;
  difficulty: ChallengeDifficulty;
  colour: "sun" | "water" | "leaf" | "storm" | "guardian";
}>;

export const CHALLENGE_STAGES: readonly ChallengeStage[] = [
  {
    id: 1,
    title: "Home Helpers",
    subtitle: "Notice one problem and make one helpful change.",
    difficulty: "Starter",
    colour: "sun",
  },
  {
    id: 2,
    title: "Street Team",
    subtitle: "Help the same system reach several neighbours.",
    difficulty: "Explorer",
    colour: "water",
  },
  {
    id: 3,
    title: "Eco Planners",
    subtitle: "Combine water, energy, nature, and clean yards.",
    difficulty: "Planner",
    colour: "leaf",
  },
  {
    id: 4,
    title: "Weather Watchers",
    subtitle: "Repair connected systems after town events.",
    difficulty: "Rescuer",
    colour: "storm",
  },
  {
    id: 5,
    title: "City Guardians",
    subtitle: "Use everything you learned to care for the whole town.",
    difficulty: "Guardian",
    colour: "guardian",
  },
] as const;

const HEALTHY: readonly ChallengeUpgradeId[] = [
  "light",
  "water",
  "garden",
  "recycle",
] as const;

export const TERRA_CHALLENGES: readonly TerraChallenge[] = [
  {
    id: "sunny-after-dark",
    stage: 1,
    order: 1,
    title: "Sunny After Dark",
    story: "Ayo is getting ready to read, but Sunny House has gone dim.",
    instruction: "Give Sunny House clean sunlight.",
    learning: "Sunlight can be turned into electricity without smoky air.",
    difficulty: "Starter",
    parMoves: 1,
    concepts: ["solar-energy", "cause-and-effect"],
    setup: {
      sunny: ["water", "garden", "recycle"],
      bluebell: HEALTHY,
      mango: HEALTHY,
    },
    goals: [
      {
        id: "sunny-light",
        type: "house-has",
        label: "Light Sunny House",
        houseId: "sunny",
        upgradeId: "light",
      },
    ],
    hints: [
      "Look for the house with dark windows.",
      "Ayo needs a clean source of electricity.",
      "Drag Sun light onto Sunny House, or open its check-up.",
    ],
  },
  {
    id: "bluebell-thirst",
    stage: 1,
    order: 2,
    title: "Bluebell Is Thirsty",
    story: "Mina's vegetables are drooping on a hot afternoon.",
    instruction: "Help clean water reach Bluebell House.",
    learning: "Plants and people need clean water, and every drop matters.",
    difficulty: "Starter",
    parMoves: 1,
    concepts: ["clean-water", "plant-needs"],
    setup: {
      sunny: HEALTHY,
      bluebell: ["light", "garden", "recycle"],
      mango: HEALTHY,
    },
    goals: [
      {
        id: "bluebell-water",
        type: "house-has",
        label: "Water Bluebell's garden",
        houseId: "bluebell",
        upgradeId: "water",
      },
    ],
    hints: [
      "Find Mina beside the blue house.",
      "Her vegetables need something clean to drink.",
      "Add Clean water to Bluebell House.",
    ],
  },
  {
    id: "mango-tidy-up",
    stage: 1,
    order: 3,
    title: "Mango Tidy-Up",
    story: "Tomi found useful cans and paper mixed into the rubbish.",
    instruction: "Give Mango House a place to sort useful things.",
    learning:
      "Sorting materials keeps yards clean and lets things be used again.",
    difficulty: "Starter",
    parMoves: 1,
    concepts: ["recycling", "materials"],
    setup: {
      sunny: HEALTHY,
      bluebell: HEALTHY,
      mango: ["light", "water", "garden"],
    },
    goals: [
      {
        id: "mango-recycle",
        type: "house-has",
        label: "Add Mango's recycle bin",
        houseId: "mango",
        upgradeId: "recycle",
      },
    ],
    hints: [
      "Look for the home with things to sort.",
      "Paper and cans can be collected instead of thrown away.",
      "Add a Recycle bin to Mango House.",
    ],
  },
  {
    id: "lights-across-the-street",
    stage: 2,
    order: 4,
    title: "Lights Across the Street",
    story: "Evening arrives and all three families need safe, clean light.",
    instruction: "Bring sunlight power to every home.",
    learning: "A neighbourhood system works only when it reaches everyone.",
    difficulty: "Explorer",
    parMoves: 3,
    concepts: ["energy-access", "fairness"],
    setup: {
      sunny: ["water", "garden", "recycle"],
      bluebell: ["water", "garden", "recycle"],
      mango: ["water", "garden", "recycle"],
    },
    goals: [
      {
        id: "all-light",
        type: "all-houses-have",
        label: "Light all three homes",
        upgradeId: "light",
      },
    ],
    hints: [
      "Count the homes whose windows are still dark.",
      "One solar change helps one home at a time.",
      "Add Sun light to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "garden-partners",
    stage: 2,
    order: 5,
    title: "Garden Partners",
    story: "Ayo and Mina want to grow flowers and vegetables together.",
    instruction: "Give both gardens plants and clean water.",
    learning:
      "Healthy green spaces need both a place to grow and reliable water.",
    difficulty: "Explorer",
    parMoves: 4,
    concepts: ["biodiversity", "water-use", "cooperation"],
    setup: {
      sunny: ["light", "recycle"],
      bluebell: ["light", "recycle"],
      mango: HEALTHY,
    },
    goals: [
      {
        id: "sunny-water",
        type: "house-has",
        label: "Bring water to Sunny",
        houseId: "sunny",
        upgradeId: "water",
      },
      {
        id: "sunny-garden",
        type: "house-has",
        label: "Grow Sunny's garden",
        houseId: "sunny",
        upgradeId: "garden",
      },
      {
        id: "bluebell-water-partners",
        type: "house-has",
        label: "Bring water to Bluebell",
        houseId: "bluebell",
        upgradeId: "water",
      },
      {
        id: "bluebell-garden",
        type: "house-has",
        label: "Grow Bluebell's garden",
        houseId: "bluebell",
        upgradeId: "garden",
      },
    ],
    hints: [
      "Each partner needs the same two kinds of help.",
      "Plants need a garden space and clean water.",
      "Add Water and Garden to Sunny and Bluebell.",
    ],
  },
  {
    id: "clean-street",
    stage: 2,
    order: 6,
    title: "The Clean Street",
    story: "Collection day is coming, but every yard needs a sorting spot.",
    instruction: "Put a recycle bin at every home.",
    learning: "Shared habits can make a whole street cleaner.",
    difficulty: "Explorer",
    parMoves: 3,
    concepts: ["recycling", "community-action"],
    setup: {
      sunny: ["light", "water", "garden"],
      bluebell: ["light", "water", "garden"],
      mango: ["light", "water", "garden"],
    },
    goals: [
      {
        id: "all-recycle",
        type: "all-houses-have",
        label: "Give every home a recycle bin",
        upgradeId: "recycle",
      },
    ],
    hints: [
      "Look for yards without the recycling symbol.",
      "The challenge includes all three families.",
      "Add Recycle bin to every home.",
    ],
  },
  {
    id: "one-happy-home",
    stage: 3,
    order: 7,
    title: "One Happy Home",
    story: "Sunny House is starting again with an empty compound.",
    instruction: "Build every part Sunny House needs.",
    learning: "A healthy home depends on several systems working together.",
    difficulty: "Planner",
    parMoves: 4,
    concepts: ["systems-thinking", "home-health"],
    setup: { sunny: [], bluebell: HEALTHY, mango: HEALTHY },
    goals: [
      {
        id: "sunny-healthy",
        type: "house-healthy",
        label: "Make Sunny House fully healthy",
        houseId: "sunny",
      },
    ],
    hints: [
      "Open Sunny's check-up and count the parts needing help.",
      "Power, water, nature, and a clean yard all matter.",
      "Add all four pieces to Sunny House.",
    ],
  },
  {
    id: "two-home-team",
    stage: 3,
    order: 8,
    title: "Two-Home Team",
    story: "Sunny and Bluebell each have different missing pieces.",
    instruction: "Make both homes fully healthy.",
    learning: "Different homes can need different solutions.",
    difficulty: "Planner",
    parMoves: 4,
    concepts: ["diagnosis", "comparison", "systems-thinking"],
    setup: {
      sunny: ["light", "garden"],
      bluebell: ["water", "recycle"],
      mango: HEALTHY,
    },
    goals: [
      {
        id: "sunny-team-healthy",
        type: "house-healthy",
        label: "Finish Sunny House",
        houseId: "sunny",
      },
      {
        id: "bluebell-team-healthy",
        type: "house-healthy",
        label: "Finish Bluebell House",
        houseId: "bluebell",
      },
    ],
    hints: [
      "The two check-ups do not show the same problems.",
      "Sunny needs water and sorting; Bluebell needs power and plants.",
      "Complete the yellow items in both home check-ups.",
    ],
  },
  {
    id: "balanced-block",
    stage: 3,
    order: 9,
    title: "Balanced Block",
    story: "The street needs a strong foundation before it can grow.",
    instruction: "Give every home at least three healthy systems.",
    learning:
      "Balance means improving several needs instead of only one score.",
    difficulty: "Planner",
    parMoves: 6,
    concepts: ["balance", "trade-offs", "systems-thinking"],
    setup: {
      sunny: ["light"],
      bluebell: ["water"],
      mango: ["garden"],
    },
    goals: [
      {
        id: "three-systems-each",
        type: "each-house-upgrade-count",
        label: "Give every home three healthy systems",
        count: 3,
      },
    ],
    hints: [
      "Check the home with the fewest healthy systems.",
      "Each home needs two more pieces, but the pieces can differ.",
      "Open every check-up and raise each home to 3 of 4.",
    ],
  },
  {
    id: "dry-week",
    stage: 4,
    order: 10,
    title: "The Dry Week",
    story: "A hot, rainless week has emptied every garden barrel.",
    instruction: "Restore clean water to all three homes.",
    learning: "A shared water problem needs a neighbourhood-wide response.",
    difficulty: "Rescuer",
    parMoves: 3,
    concepts: ["drought", "water-resilience"],
    setup: {
      sunny: ["light", "garden", "recycle"],
      bluebell: ["light", "garden", "recycle"],
      mango: ["light", "garden", "recycle"],
    },
    goals: [
      {
        id: "restore-all-water",
        type: "all-houses-have",
        label: "Restore water everywhere",
        upgradeId: "water",
      },
    ],
    hints: [
      "The dry week affected every family.",
      "Look for the same yellow Water check in each home.",
      "Add Clean water to all three homes.",
    ],
  },
  {
    id: "cloudy-blackout",
    stage: 4,
    order: 11,
    title: "Cloudy Blackout",
    story: "Heavy clouds have interrupted the street's clean power.",
    instruction: "Help every home shine again.",
    learning: "Reliable energy planning considers the whole community.",
    difficulty: "Rescuer",
    parMoves: 3,
    concepts: ["energy-resilience", "community-access"],
    setup: {
      sunny: ["water", "garden", "recycle"],
      bluebell: ["water", "garden", "recycle"],
      mango: ["water", "garden", "recycle"],
    },
    goals: [
      {
        id: "restore-all-light",
        type: "all-houses-have",
        label: "Restore light everywhere",
        upgradeId: "light",
      },
    ],
    hints: [
      "The dark windows show one shared problem.",
      "All three homes need clean electricity again.",
      "Add Sun light to every home.",
    ],
  },
  {
    id: "rainy-cleanup",
    stage: 4,
    order: 12,
    title: "Rainy-Day Cleanup",
    story: "A downpour scattered materials and strained two gardens.",
    instruction: "Diagnose each home and repair every missing system.",
    learning:
      "After an event, inspect each place instead of guessing one solution.",
    difficulty: "Rescuer",
    parMoves: 6,
    concepts: ["recovery", "diagnosis", "resilience"],
    setup: {
      sunny: ["light", "garden"],
      bluebell: ["water", "recycle"],
      mango: ["light", "garden"],
    },
    goals: [
      {
        id: "rainy-all-healthy",
        type: "healthy-house-count",
        label: "Repair all three homes",
        count: 3,
      },
    ],
    hints: [
      "The families do not all need the same repair.",
      "Open every check-up and compare the yellow rows.",
      "Finish every missing item until all three check-ups are green.",
    ],
  },
  {
    id: "repair-relay",
    stage: 5,
    order: 13,
    title: "Repair Relay",
    story: "Each family has a different final job for the city guardian.",
    instruction: "Complete all three homes in six careful moves.",
    learning:
      "Good planners move between needs and keep the whole system in view.",
    difficulty: "Guardian",
    parMoves: 6,
    concepts: ["planning", "diagnosis", "whole-system"],
    setup: {
      sunny: ["light", "garden"],
      bluebell: ["water", "recycle"],
      mango: ["light", "water"],
    },
    goals: [
      {
        id: "relay-all-healthy",
        type: "healthy-house-count",
        label: "Complete the repair relay",
        count: 3,
      },
    ],
    hints: [
      "Each home begins with two healthy systems.",
      "Use the check-ups to find two missing pieces per home.",
      "Add exactly the two yellow items shown for each family.",
    ],
  },
  {
    id: "green-restart",
    stage: 5,
    order: 14,
    title: "Green Restart",
    story: "The neighbourhood has power, but everything else must regrow.",
    instruction: "Rebuild water, gardens, and clean yards for everyone.",
    learning:
      "Recovery is strongest when nature and essential services return together.",
    difficulty: "Guardian",
    parMoves: 9,
    concepts: ["recovery", "biodiversity", "essential-services"],
    setup: { sunny: ["light"], bluebell: ["light"], mango: ["light"] },
    goals: [
      {
        id: "restart-all-healthy",
        type: "healthy-house-count",
        label: "Make the whole street healthy",
        count: 3,
      },
    ],
    hints: [
      "Power is ready, so inspect the other three systems.",
      "Every home still needs water, nature, and sorting.",
      "Add Clean water, Garden, and Recycle bin to all three homes.",
    ],
  },
  {
    id: "big-storm-finale",
    stage: 5,
    order: 15,
    title: "The Big Storm Finale",
    story:
      "A final storm tested every part of Terra World. The families are counting on you.",
    instruction: "Inspect, plan, and make all three homes healthy again.",
    learning:
      "Resilient towns recover by reconnecting many systems, not by fixing only one.",
    difficulty: "Guardian",
    parMoves: 9,
    concepts: ["climate-resilience", "systems-thinking", "community-care"],
    setup: {
      sunny: ["garden"],
      bluebell: ["water"],
      mango: ["recycle"],
    },
    goals: [
      {
        id: "finale-all-healthy",
        type: "healthy-house-count",
        label: "Restore the whole neighbourhood",
        count: 3,
      },
    ],
    hints: [
      "Start with the home that needs the fewest guesses.",
      "Each check-up shows three missing systems.",
      "Repair every yellow item until all three homes are fully green.",
    ],
  },
] as const;

export type ChallengeTownState = Readonly<
  Record<ChallengeHouseId, readonly string[]>
>;

export function challengeById(id: string): TerraChallenge | null {
  return TERRA_CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}

export function challengesForStage(stage: number): readonly TerraChallenge[] {
  return TERRA_CHALLENGES.filter((challenge) => challenge.stage === stage);
}

export function isChallengeGoalComplete(
  goal: ChallengeGoal,
  town: ChallengeTownState,
): boolean {
  switch (goal.type) {
    case "house-has":
      return town[goal.houseId].includes(goal.upgradeId);
    case "house-healthy":
      return CHALLENGE_UPGRADE_IDS.every((upgrade) =>
        town[goal.houseId].includes(upgrade),
      );
    case "all-houses-have":
      return CHALLENGE_HOUSE_IDS.every((houseId) =>
        town[houseId].includes(goal.upgradeId),
      );
    case "healthy-house-count":
      return (
        CHALLENGE_HOUSE_IDS.filter((houseId) =>
          CHALLENGE_UPGRADE_IDS.every((upgrade) =>
            town[houseId].includes(upgrade),
          ),
        ).length >= goal.count
      );
    case "each-house-upgrade-count":
      return CHALLENGE_HOUSE_IDS.every(
        (houseId) =>
          CHALLENGE_UPGRADE_IDS.filter((upgrade) =>
            town[houseId].includes(upgrade),
          ).length >= goal.count,
      );
  }
}

export function completedGoalIds(
  challenge: TerraChallenge,
  town: ChallengeTownState,
): readonly string[] {
  return challenge.goals
    .filter((goal) => isChallengeGoalComplete(goal, town))
    .map((goal) => goal.id);
}

export function isChallengeComplete(
  challenge: TerraChallenge,
  town: ChallengeTownState,
): boolean {
  return challenge.goals.every((goal) => isChallengeGoalComplete(goal, town));
}

export function challengeStars(input: {
  readonly challenge: TerraChallenge;
  readonly moves: number;
  readonly hintsUsed: number;
}): 1 | 2 | 3 {
  if (input.moves <= input.challenge.parMoves && input.hintsUsed === 0)
    return 3;
  if (input.moves <= input.challenge.parMoves + 2 && input.hintsUsed <= 2)
    return 2;
  return 1;
}

export function nextChallengeId(currentId: string): string | null {
  const index = TERRA_CHALLENGES.findIndex(
    (challenge) => challenge.id === currentId,
  );
  return index < 0 || index === TERRA_CHALLENGES.length - 1
    ? null
    : (TERRA_CHALLENGES[index + 1]?.id ?? null);
}

export function isChallengeUnlocked(
  challengeId: string,
  completedIds: readonly string[],
): boolean {
  const index = TERRA_CHALLENGES.findIndex(
    (challenge) => challenge.id === challengeId,
  );
  return (
    index === 0 ||
    (index > 0 && completedIds.includes(TERRA_CHALLENGES[index - 1]?.id ?? ""))
  );
}

export function copyChallengeSetup(
  challenge: TerraChallenge,
): Record<ChallengeHouseId, readonly ChallengeUpgradeId[]> {
  return {
    sunny: [...challenge.setup.sunny],
    bluebell: [...challenge.setup.bluebell],
    mango: [...challenge.setup.mango],
  };
}

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
  "Routine" | "Local" | "Coordinated" | "Recovery" | "Complex";

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
    title: "Service Assessment",
    subtitle: "Inspect individual properties and resolve missing services.",
    difficulty: "Routine",
    colour: "sun",
  },
  {
    id: 2,
    title: "Neighbourhood Services",
    subtitle: "Extend essential services across the residential block.",
    difficulty: "Local",
    colour: "water",
  },
  {
    id: 3,
    title: "Coordinated Maintenance",
    subtitle:
      "Address service gaps across power, water, gardens, and recycling.",
    difficulty: "Coordinated",
    colour: "leaf",
  },
  {
    id: 4,
    title: "Service Recovery",
    subtitle: "Assess disruption and restore residential services.",
    difficulty: "Recovery",
    colour: "storm",
  },
  {
    id: 5,
    title: "District Restoration",
    subtitle: "Coordinate complete repairs for Rivergate's residential block.",
    difficulty: "Complex",
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
    title: "Sunny House Power Restoration",
    story:
      "Ayo reports a power gap at Sunny House. Rivergate's market and bus routes remain active around the property.",
    instruction: "Inspect Sunny House and restore its solar power system.",
    learning:
      "The solar upgrade resolves Sunny House's missing power system; its other services remain in place.",
    difficulty: "Routine",
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
        label: "Restore solar power at Sunny House",
        houseId: "sunny",
        upgradeId: "light",
      },
    ],
    hints: [
      "Inspect Sunny House for the missing service.",
      "Water, garden, and recycling are already in place; power is missing.",
      "Add solar power to Sunny House.",
    ],
  },
  {
    id: "bluebell-thirst",
    stage: 1,
    order: 2,
    title: "Bluebell Water Service",
    story:
      "Mina reports that Bluebell House lacks clean water. The garden is in place, but its water service is missing.",
    instruction: "Inspect Bluebell House and restore clean water.",
    learning:
      "A garden upgrade does not replace the property's need for a clean water service.",
    difficulty: "Routine",
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
        label: "Restore clean water at Bluebell House",
        houseId: "bluebell",
        upgradeId: "water",
      },
    ],
    hints: [
      "Inspect Bluebell's water service before changing the garden.",
      "The garden is installed; clean water is the missing system.",
      "Add clean water to Bluebell House.",
    ],
  },
  {
    id: "mango-tidy-up",
    stage: 1,
    order: 3,
    title: "Mango Recycling Provision",
    story:
      "Tomi reports mixed paper and cans outside Mango House after market day. The property has no recycling provision.",
    instruction: "Install recycling at Mango House.",
    learning:
      "Recycling is a separate service requirement, even where power, water, and gardens are already in place.",
    difficulty: "Routine",
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
        label: "Install recycling at Mango House",
        houseId: "mango",
        upgradeId: "recycle",
      },
    ],
    hints: [
      "Inspect Mango's recycling provision.",
      "Power, water, and garden services are complete; recycling is missing.",
      "Add recycling to Mango House.",
    ],
  },
  {
    id: "lights-across-the-street",
    stage: 2,
    order: 4,
    title: "Residential Power Coverage",
    story:
      "All three homes lack solar power. Complete the residential block's coverage while its other services remain operational.",
    instruction: "Install solar power at all three homes.",
    learning:
      "Block-wide coverage requires a separate power upgrade at every property.",
    difficulty: "Local",
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
        label: "Provide solar power to all three homes",
        upgradeId: "light",
      },
    ],
    hints: [
      "Check which properties still lack power.",
      "Each solar upgrade serves one property.",
      "Add solar power to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "garden-partners",
    stage: 2,
    order: 5,
    title: "Water and Garden Works",
    story:
      "Ayo and Mina request garden improvements. Sunny and Bluebell both need clean water and a garden upgrade.",
    instruction: "Install clean water and gardens at Sunny and Bluebell.",
    learning:
      "Water and garden provision are distinct requirements; completing one does not complete the other.",
    difficulty: "Local",
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
        label: "Install clean water at Sunny House",
        houseId: "sunny",
        upgradeId: "water",
      },
      {
        id: "sunny-garden",
        type: "house-has",
        label: "Install Sunny House's garden",
        houseId: "sunny",
        upgradeId: "garden",
      },
      {
        id: "bluebell-water-partners",
        type: "house-has",
        label: "Install clean water at Bluebell House",
        houseId: "bluebell",
        upgradeId: "water",
      },
      {
        id: "bluebell-garden",
        type: "house-has",
        label: "Install Bluebell House's garden",
        houseId: "bluebell",
        upgradeId: "garden",
      },
    ],
    hints: [
      "Compare the missing services at Sunny and Bluebell.",
      "Both properties need water and gardens; Mango needs no work.",
      "Add clean water and a garden to Sunny and Bluebell.",
    ],
  },
  {
    id: "clean-street",
    stage: 2,
    order: 6,
    title: "Block Recycling Coverage",
    story:
      "Mr. Sam has identified a service gap: none of the three properties has recycling provision.",
    instruction: "Install recycling at every home.",
    learning:
      "Recycling coverage is complete only when all three properties have the service.",
    difficulty: "Local",
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
        label: "Provide recycling to all three homes",
        upgradeId: "recycle",
      },
    ],
    hints: [
      "Inspect recycling provision across the block.",
      "All three homes need the same upgrade.",
      "Add recycling to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "one-happy-home",
    stage: 3,
    order: 7,
    title: "Sunny House Full Refit",
    story:
      "Sunny House has no core upgrades installed. Ayo needs all four services restored while neighbouring homes remain complete.",
    instruction: "Complete all four core systems at Sunny House.",
    learning:
      "Full service requires power, water, a garden, and recycling at the same property.",
    difficulty: "Coordinated",
    parMoves: 4,
    concepts: ["systems-thinking", "home-health"],
    setup: { sunny: [], bluebell: HEALTHY, mango: HEALTHY },
    goals: [
      {
        id: "sunny-healthy",
        type: "house-healthy",
        label: "Complete all four services at Sunny House",
        houseId: "sunny",
      },
    ],
    hints: [
      "Inspect Sunny House's four core systems.",
      "Sunny needs power, water, a garden, and recycling.",
      "Add all four core upgrades to Sunny House.",
    ],
  },
  {
    id: "two-home-team",
    stage: 3,
    order: 8,
    title: "Paired Property Maintenance",
    story:
      "Sunny and Bluebell have different service gaps. Inspect each property before assigning its repairs.",
    instruction: "Complete all four core systems at Sunny and Bluebell.",
    learning:
      "A shared maintenance objective can require different work at each property.",
    difficulty: "Coordinated",
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
        label: "Complete Sunny House's services",
        houseId: "sunny",
      },
      {
        id: "bluebell-team-healthy",
        type: "house-healthy",
        label: "Complete Bluebell House's services",
        houseId: "bluebell",
      },
    ],
    hints: [
      "Compare the two properties' inspection results.",
      "Sunny needs water and recycling; Bluebell needs power and a garden.",
      "Install each missing service at Sunny and Bluebell.",
    ],
  },
  {
    id: "balanced-block",
    stage: 3,
    order: 9,
    title: "Minimum Service Standard",
    story:
      "Each property starts with one core system. Raise service coverage across the block without leaving a home behind.",
    instruction: "Provide at least three core systems at every home.",
    learning:
      "This objective measures each property's service coverage, not the total number of upgrades across the block.",
    difficulty: "Coordinated",
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
        label: "Provide three core systems at every home",
        count: 3,
      },
    ],
    hints: [
      "Check each property's core service count.",
      "Every home needs two more core upgrades; the choices can differ.",
      "Raise Sunny, Bluebell, and Mango to at least three of four core systems.",
    ],
  },
  {
    id: "dry-week",
    stage: 4,
    order: 10,
    title: "Water Service Recovery",
    story:
      "Following a dry week, all three properties need their clean water service restored. Their other upgrades remain in place.",
    instruction: "Restore clean water to all three homes.",
    learning:
      "A block-wide disruption requires checking that water service is restored at every property.",
    difficulty: "Recovery",
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
        label: "Restore clean water at all three homes",
        upgradeId: "water",
      },
    ],
    hints: [
      "Check water service across the residential block.",
      "Every home has the same missing water upgrade.",
      "Add clean water to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "cloudy-blackout",
    stage: 4,
    order: 11,
    title: "Power Service Recovery",
    story:
      "After severe weather, the residential block's power systems need restoration. Water, gardens, and recycling remain in place.",
    instruction: "Restore solar power at every home.",
    learning:
      "Restoring one property's power does not resolve the remaining service gaps across the block.",
    difficulty: "Recovery",
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
        label: "Restore solar power at all three homes",
        upgradeId: "light",
      },
    ],
    hints: [
      "Inspect the same power system at each property.",
      "All three homes need a solar power upgrade.",
      "Add solar power to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "rainy-cleanup",
    stage: 4,
    order: 12,
    title: "Post-Rain Service Repairs",
    story:
      "A downpour has left service gaps across the residential block. Each property needs a specific set of repairs.",
    instruction: "Diagnose each home and repair every missing system.",
    learning:
      "Property-level inspections distinguish shared service gaps from repairs needed at only one location.",
    difficulty: "Recovery",
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
        label: "Restore all core services across the block",
        count: 3,
      },
    ],
    hints: [
      "Inspect each property; the missing services are not identical.",
      "Sunny and Mango need water and recycling; Bluebell needs power and a garden.",
      "Complete all four core systems at each of the three homes.",
    ],
  },
  {
    id: "repair-relay",
    stage: 5,
    order: 13,
    title: "Coordinated Repair Schedule",
    story:
      "Each property has two missing services. Coordinate the remaining work while the surrounding city stays active.",
    instruction:
      "Restore all core services; the reference plan uses six upgrades.",
    learning:
      "Inspecting existing services avoids redundant work and identifies the six upgrades needed across this block.",
    difficulty: "Complex",
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
        label: "Complete all scheduled property repairs",
        count: 3,
      },
    ],
    hints: [
      "Each property starts with two of its four core systems.",
      "Use inspections to identify two missing services per home.",
      "Install both missing upgrades at Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "green-restart",
    stage: 5,
    order: 14,
    title: "Residential Service Rebuild",
    story:
      "Power is in place across the block. Every property still lacks water, a garden, and recycling.",
    instruction: "Restore water, gardens, and recycling at all three homes.",
    learning:
      "Power coverage alone does not meet the block's full service requirements.",
    difficulty: "Complex",
    parMoves: 9,
    concepts: ["recovery", "biodiversity", "essential-services"],
    setup: { sunny: ["light"], bluebell: ["light"], mango: ["light"] },
    goals: [
      {
        id: "restart-all-healthy",
        type: "healthy-house-count",
        label: "Restore all four services at every home",
        count: 3,
      },
    ],
    hints: [
      "Power needs no work; inspect the other three core systems.",
      "Each property needs clean water, a garden, and recycling.",
      "Add those three upgrades to Sunny, Bluebell, and Mango.",
    ],
  },
  {
    id: "big-storm-finale",
    stage: 5,
    order: 15,
    title: "District Recovery Plan",
    story:
      "A major storm has left one core system in place at each property. Restore the residential block's remaining services.",
    instruction: "Inspect every property and restore all four core systems.",
    learning:
      "Complete recovery means closing every property's service gaps, including those that differ from its neighbours.",
    difficulty: "Complex",
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
        label: "Complete the residential block's recovery",
        count: 3,
      },
    ],
    hints: [
      "Inspect what remains at each property before assigning repairs.",
      "Sunny retains its garden, Bluebell its water, and Mango its recycling.",
      "Install the three missing core upgrades at each home.",
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

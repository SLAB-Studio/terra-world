import type { TownVenue } from "./venue-catalog";

export type IndoorActivity =
  | "watch"
  | "read"
  | "type"
  | "cook"
  | "serve"
  | "chat"
  | "wait"
  | "eat"
  | "repair"
  | "inspect";
export type IndoorProp =
  "book" | "spoon" | "fork" | "screwdriver" | "sample" | "card";
export type IndoorTask = Readonly<{
  /** World-space contact points authored against the matching furniture. */
  left: readonly [number, number, number];
  right: readonly [number, number, number];
}>;
export type InteriorPerson = Readonly<{
  name: string;
  role: string;
  x: number;
  z: number;
  yaw: number;
  activity: IndoorActivity;
  child?: boolean;
  woman?: boolean;
  seat?: number;
  task?: IndoorTask;
  prop?: IndoorProp;
  lines: readonly string[];
}>;
export type InteriorLifePlan = Readonly<{
  use: string;
  title: string;
  people: readonly InteriorPerson[];
}>;

const person = (
  name: string,
  role: string,
  x: number,
  z: number,
  yaw: number,
  activity: IndoorActivity,
  lines: readonly string[],
  extra: Pick<
    InteriorPerson,
    "child" | "woman" | "seat" | "task" | "prop"
  > = {},
): InteriorPerson => ({
  name,
  role,
  x,
  z,
  yaw,
  activity,
  lines,
  ...(activity === "read" ? { prop: "book" as const } : {}),
  ...extra,
});

/** Authored everyday scenes, not financial transactions or live AI conversations. */
export function homeLifePlan(): InteriorLifePlan {
  return {
    use: "home",
    title: "Family at home",
    people: [
      person(
        "Maya",
        "Watching TV",
        -4.95,
        -3.98,
        Math.PI,
        "watch",
        [
          "Look—the sea turtles are hatching!",
          "Can we watch the next episode together?",
        ],
        { child: true, woman: true, seat: 1.74 },
      ),
      person(
        "Ben",
        "Watching TV",
        -3.35,
        -3.98,
        Math.PI,
        "watch",
        [
          "That one made it to the water.",
          "I’ll put the remote back after this.",
        ],
        { child: true, seat: 1.74 },
      ),
      person(
        "Amara",
        "Preparing dinner",
        6.64,
        -4.12,
        0,
        "cook",
        [
          "The vegetables are ready. Could someone set the table?",
          "A little stir, then we can sit down to dinner.",
        ],
        {
          woman: true,
          prop: "spoon",
          task: { left: [6.85, 2.15, -4.56], right: [6.4, 2.67, -4.7] },
        },
      ),
      person(
        "Daniel",
        "Tending the plants",
        -7.15,
        4.6,
        -Math.PI / 2,
        "serve",
        [
          "These herbs will be ready for the kitchen soon.",
          "I’m checking the soil before watering again.",
        ],
      ),
    ],
  };
}

export function venueLifePlan(
  venue: TownVenue,
  floorIndex: number,
): InteriorLifePlan {
  const floor = venue.floors[floorIndex]!;
  const use =
    floor.use === "lobby" && venue.kind !== "apartments" && venue.kind !== "hub"
      ? venue.kind
      : floor.use;
  const people: InteriorPerson[] = [];
  if (use === "bank") {
    people.push(
      person(
        "Ada",
        "Bank teller",
        -6,
        3.55,
        0,
        "serve",
        [
          "Good afternoon. Is this a deposit?",
          "Your deposit slip is ready. Please check the amount.",
        ],
        {
          woman: true,
          prop: "card",
          task: { left: [-5.8, 1.82, 3.06], right: [-6.2, 1.82, 3.06] },
        },
      ),
      person(
        "Omar",
        "Depositing at the counter",
        -7.6,
        1.25,
        Math.PI,
        "serve",
        [
          "Yes, I’d like to deposit today’s shop takings.",
          "Thank you. I’ll keep the receipt.",
        ],
        {
          prop: "card",
          task: { left: [-7.8, 1.83, 1.8], right: [-7.4, 1.83, 1.8] },
        },
      ),
      person(
        "Zoe",
        "Service adviser",
        6,
        3.55,
        0,
        "type",
        [
          "I can help with your service payment here.",
          "Here’s the receipt for your records.",
        ],
        {
          woman: true,
          task: { left: [6.2, 1.81, 3.04], right: [5.8, 1.81, 3.04] },
        },
      ),
      person(
        "Ravi",
        "Paying for a service",
        7.28,
        1.3,
        Math.PI,
        "serve",
        [
          "I’m here to pay the neighbourhood service bill.",
          "Could I have a receipt, please?",
        ],
        {
          prop: "card",
          task: { left: [7.07, 1.81, 1.73], right: [7.5, 2.11, 1.82] },
        },
      ),
      person(
        "Lina",
        "Waiting her turn",
        -6,
        -2,
        Math.PI,
        "wait",
        ["I’ve filled in my slip. I’m next in line."],
        { woman: true },
      ),
      person(
        "Eli",
        "Using the ATM",
        9.2,
        -4.5,
        -Math.PI / 2,
        "serve",
        ["I’m checking the on-screen instructions."],
        { task: { left: [9.72, 1.73, -4.3], right: [9.82, 1.78, -4.68] } },
      ),
    );
  } else if (use === "apartments") {
    people.push(
      person(
        "Maya",
        "Watching TV",
        -6,
        -2.68,
        Math.PI,
        "watch",
        ["This documentary is showing our river!"],
        { child: true, woman: true, seat: 1.03 },
      ),
      person(
        "Amara",
        "Making lunch",
        7.57,
        6.85,
        Math.PI,
        "cook",
        ["Lunch is nearly ready. Let’s clear the table."],
        {
          woman: true,
          prop: "spoon",
          task: { left: [7.4, 1.46, 7.26], right: [7.8, 1.97, 7.3] },
        },
      ),
      person(
        "Noah",
        "Reading at the table",
        5,
        -1.4,
        0,
        "read",
        ["I’ll finish this page before lunch."],
        { child: true, seat: 0.84 },
      ),
    );
  } else if (use === "hub") {
    for (const [i, x, z] of [
      [0, -6, -3.3],
      [1, 6, -3.3],
      [2, -6, 2.7],
      [3, 6, 2.7],
    ] as const)
      people.push(
        person(
          ["Ada", "Tayo", "Mina", "Nico"][i]!,
          "Working at a desk",
          x,
          z,
          Math.PI,
          "type",
          [
            "I’m checking the work schedule.",
            "The updated plans are ready for review.",
          ],
          {
            woman: i % 2 === 0,
            seat: 0.84,
            task: {
              left: [x - 0.2, 1.44, z + 0.47],
              right: [x + 0.2, 1.44, z + 0.47],
            },
          },
        ),
      );
    people.push(
      person("Sam", "Discussing a project", -8.8, -6, Math.PI / 2, "chat", [
        "Shall we review the plan before the meeting?",
      ]),
      person(
        "Lina",
        "Discussing a project",
        -6.7,
        -6,
        -Math.PI / 2,
        "chat",
        ["Yes. The residents’ feedback is in the folder."],
        { woman: true },
      ),
    );
  } else if (use === "lobby") {
    people.push(
      person(
        "Mira",
        "Helping residents",
        -6,
        3.55,
        0,
        "type",
        [
          "Welcome home. Repairs are handled at this desk.",
          "The lift is straight ahead.",
        ],
        {
          woman: true,
          task: { left: [-5.8, 1.81, 3.04], right: [-6.2, 1.81, 3.04] },
        },
      ),
      person("Kojo", "Talking to reception", -8, 0.5, Math.PI, "chat", [
        "Could you check our maintenance request?",
      ]),
      person(
        "Nia",
        "Reading while waiting",
        6,
        -2,
        0,
        "read",
        ["There’s a good story in this week’s paper."],
        { woman: true, seat: 1.03 },
      ),
    );
  } else if (use === "library" || use === "bookshop") {
    people.push(
      person(
        "Nia",
        "Reading",
        4.8,
        -1.6,
        0,
        "read",
        ["This chapter explains how the city grew."],
        { woman: true, seat: 0.84 },
      ),
      person(
        "Ben",
        "Reading",
        7.2,
        4.4,
        0,
        "read",
        ["I found the book I was looking for."],
        { child: true, seat: 0.84 },
      ),
      person(
        "Mina",
        "Returning a book",
        -7.8,
        -3,
        Math.PI,
        "serve",
        ["I’ll put this back on the right shelf."],
        { woman: true },
      ),
      person("Sam", "Browsing the shelves", -4, 6, 0, "read", [
        "Let’s see what is on this shelf.",
      ]),
    );
  } else if (use === "cafe" || use === "market") {
    people.push(
      person(
        "Amara",
        use === "cafe" ? "Serving coffee" : "Serving produce",
        -5.5,
        7.8,
        0,
        "serve",
        ["What can I get for you today?", "Here you go. Enjoy!"],
        {
          woman: true,
          task: { left: [-5.3, 2.04, 7.35], right: [-5.7, 2.04, 7.35] },
        },
      ),
      person(
        "Tayo",
        "Paying at the counter",
        -3.73,
        5.53,
        Math.PI,
        "serve",
        ["Two coffees and a loaf, please.", "I’ll tap my card. Thank you."],
        {
          prop: "card",
          task: { left: [-3.95, 1.98, 5.93], right: [-3.5, 2.1, 5.95] },
        },
      ),
      person(
        "Lina",
        "Waiting to order",
        -7.5,
        4.7,
        Math.PI,
        "wait",
        ["The bread smells wonderful."],
        { woman: true },
      ),
      person(
        "Maya",
        "Eating with family",
        4.7,
        -2.43,
        0,
        "eat",
        ["Can we share the last piece?"],
        {
          child: true,
          woman: true,
          seat: 0.84,
          prop: "fork",
          task: { left: [4.88, 1.43, -2.81], right: [4.6, 1.6, -2.81] },
        },
      ),
      person(
        "Daniel",
        "Taking a break",
        -6.8,
        -2,
        0,
        "chat",
        ["It’s good to sit down for a moment."],
        { seat: 0.84 },
      ),
    );
  } else if (use === "clinic") {
    people.push(
      person(
        "Zoe",
        "Checking appointments",
        -6,
        -2,
        0,
        "type",
        ["Please take a seat. We’ll call your name."],
        {
          woman: true,
          task: { left: [-5.8, 1.43, -2.46], right: [-6.2, 1.43, -2.46] },
        },
      ),
      person(
        "Ada",
        "Checking in",
        -6,
        -4.6,
        Math.PI,
        "chat",
        ["I’m here for my appointment."],
        { woman: true },
      ),
      person(
        "Sam",
        "Waiting",
        -8,
        1.2,
        0,
        "read",
        ["I’ll wait here until I’m called."],
        { seat: 0.84 },
      ),
      person(
        "Omar",
        "Preparing the examination room",
        5.1,
        4,
        -Math.PI / 2,
        "serve",
        ["The room is ready for the next appointment."],
      ),
    );
  } else if (use === "school") {
    people.push(
      person(
        "Ada",
        "Teaching",
        -5.4,
        6.7,
        0,
        "chat",
        ["Let’s compare what everyone noticed."],
        { woman: true },
      ),
    );
    for (const [i, x, z] of [
      [0, -7, -4.25],
      [1, -3.5, -0.75],
      [2, 3.5, 2.75],
      [3, 7, -4.25],
    ] as const)
      people.push(
        person(
          ["Maya", "Noah", "Anya", "Ben"][i]!,
          "Working on a lesson",
          x,
          z,
          Math.PI,
          "read",
          ["I’m writing down what I found."],
          { child: true, woman: i % 2 === 0, seat: 0.84 },
        ),
      );
  } else if (use === "science" || use === "workshop") {
    people.push(
      person(
        "Mina",
        use === "science" ? "Checking an experiment" : "Repairing equipment",
        use === "science" ? -6.22 : -7.72,
        use === "science" ? -3.75 : -1.4,
        Math.PI,
        use === "science" ? "inspect" : "repair",
        [
          use === "science"
            ? "Let’s record the measurement before changing anything."
            : "I’m tightening the loose part, then I’ll test it.",
        ],
        {
          woman: true,
          prop: use === "science" ? "sample" : "screwdriver",
          task:
            use === "science"
              ? { left: [-6.4, 1.49, -3.27], right: [-6, 1.72, -3.2] }
              : { left: [-7.95, 1.49, -0.96], right: [-7.5, 1.95, -0.95] },
        },
      ),
      person(
        "Malik",
        "Working at the bench",
        use === "science" ? 5.78 : 4.27,
        use === "science" ? 2.25 : -1.4,
        Math.PI,
        use === "science" ? "inspect" : "repair",
        ["Could you pass the small tool, please?"],
        {
          prop: use === "science" ? "sample" : "screwdriver",
          task:
            use === "science"
              ? { left: [5.6, 1.49, 2.73], right: [6, 1.72, 2.8] }
              : { left: [4.05, 1.49, -0.96], right: [4.5, 1.95, -0.95] },
        },
      ),
      person("Eli", "Discussing the results", -7.7, 5.8, Math.PI / 2, "chat", [
        "That looks much better than the first test.",
      ]),
      person(
        "Zoe",
        "Discussing the results",
        -5.6,
        5.8,
        -Math.PI / 2,
        "chat",
        ["Let’s note what changed."],
        { woman: true },
      ),
    );
  } else if (use === "studios") {
    people.push(
      person(
        "Ezra",
        "Mixing a recording",
        -6,
        -2.23,
        Math.PI,
        "type",
        ["Let’s bring the voice up a little."],
        {
          seat: 0.84,
          task: { left: [-6.2, 1.55, -1.66], right: [-5.75, 1.55, -1.59] },
        },
      ),
      person(
        "Lina",
        "At the microphone",
        6,
        2.1,
        0,
        "chat",
        ["Ready when you are. Let’s try that line again."],
        { woman: true },
      ),
      person("Sam", "Reviewing the session", -3.3, -4, Math.PI, "read", [
        "That take sounded clear.",
      ]),
    );
  } else if (use === "arts") {
    people.push(
      person(
        "Ada",
        "Viewing the exhibition",
        -7,
        -1,
        Math.PI,
        "read",
        ["I like how the light changes across this piece."],
        { woman: true },
      ),
      person("Malik", "Talking about the artwork", 6.8, 5.9, 0.3, "chat", [
        "Do you think the artist painted the river at dusk?",
      ]),
      person(
        "Nia",
        "Talking about the artwork",
        5.5,
        4.3,
        Math.PI + 0.3,
        "chat",
        ["Yes—the reflection has that evening colour."],
        { woman: true },
      ),
    );
  } else if (use === "bus") {
    people.push(
      person(
        "Lina",
        "Waiting for the bus",
        -4,
        4.5,
        0,
        "read",
        ["The next bus should be here soon."],
        { woman: true, seat: 0.84 },
      ),
      person(
        "Sam",
        "Waiting for the bus",
        2,
        4.5,
        0,
        "wait",
        ["I’m heading to the market."],
        { seat: 0.84 },
      ),
      person("Ben", "Checking the route", -5, -0.4, Math.PI, "read", [
        "This route stops at the library.",
      ]),
    );
  } else if (use === "dock") {
    people.push(
      person(
        "Omar",
        "Resting by the river",
        -7,
        3,
        0,
        "read",
        ["The water is calm today."],
        { seat: 1.03 },
      ),
      person(
        "Ada",
        "Watching the boats",
        5,
        6.5,
        Math.PI,
        "chat",
        ["Look at the boat coming around the bend."],
        { woman: true },
      ),
      person(
        "Maya",
        "Watching the river",
        6.8,
        6.5,
        Math.PI,
        "wait",
        ["I can see it!"],
        { child: true, woman: true },
      ),
    );
  } else {
    people.push(
      person(
        "Nia",
        "Enjoying the terrace",
        -8,
        1.5,
        0,
        "read",
        ["A little fresh air between errands."],
        { woman: true, seat: 0.84 },
      ),
      person("Sam", "Chatting with a neighbour", 5, -5.4, Math.PI / 2, "chat", [
        "How has your day been?",
      ]),
      person(
        "Ada",
        "Chatting with a neighbour",
        7,
        -5.4,
        -Math.PI / 2,
        "chat",
        ["Busy. It’s nice to stop here for a while."],
        { woman: true },
      ),
    );
  }
  return { use, title: `${venue.name} · ${floor.label}`, people };
}

import type { InteriorLifePlan } from "./interior-life-plan";
import type {
  IndoorRoutineResident,
  IndoorRoutineStop,
} from "./indoor-routines";
import type { WalkBounds } from "./walking";

const stop = (
  x: number,
  z: number,
  yaw: number,
  label: string,
  activity: "idle" | "chat" = "idle",
): IndoorRoutineStop => ({
  x,
  z,
  yaw,
  label,
  activity,
  dwell: activity === "chat" ? 8 : 5,
});
const pi = Math.PI;

/** Authored destinations beside actual fixtures, never random circles or wall-crossing wandering. */
export function interiorRoutinePlan(
  plan: InteriorLifePlan,
): IndoorRoutineResident[] {
  return plan.people.map((person, i) => {
    let stops: IndoorRoutineStop[];
    let room: WalkBounds | undefined;
    const { x, z } = person;
    switch (plan.use) {
      case "home":
        if (person.activity === "watch") {
          room = { minX: -7.85, maxX: -0.45, minZ: -5.65, maxZ: -0.45 };
          stops =
            i === 0
              ? [
                  stop(
                    -6.85,
                    -2.3,
                    pi / 2,
                    "Looking out of the living-room window",
                  ),
                  stop(-3, -0.6, pi, "Choosing the next TV programme"),
                ]
              : [
                  stop(-1.65, -2.5, -pi / 2, "Taking a break from the TV"),
                  stop(-2.6, -0.6, pi, "Checking what is on TV"),
                ];
        } else if (person.activity === "cook") {
          room = { minX: 0.45, maxX: 7.85, minZ: -5.65, maxZ: -0.45 };
          stops = [
            stop(3.9, -4.03, 0, "Checking the sink before preparing dinner"),
            stop(4.15, -0.48, 0, "Checking the ingredients on the island"),
          ];
        } else {
          room = { minX: -7.85, maxX: -0.45, minZ: 0.45, maxZ: 5.55 };
          stops = [
            stop(-6.1, 1.5, pi, "Checking the first planter"),
            stop(-2.1, 1.5, pi, "Inspecting the growing plants"),
          ];
        }
        break;
      case "apartments":
        stops =
          person.activity === "cook"
            ? [
                stop(5.3, 6.65, pi, "Checking the kitchen counter"),
                stop(3.3, 6.5, pi, "Checking the fridge"),
              ]
            : person.activity === "watch"
              ? [
                  stop(-8.3, -3.6, pi / 2, "Taking a break by the window"),
                  stop(-3.8, -1.9, 0, "Stretching after watching TV"),
                ]
              : [
                  stop(8.6, -1.4, -pi / 2, "Taking a reading break"),
                  stop(5, 3.7, pi, "Saying hello to the cook", "chat"),
                ];
        break;
      case "bank":
        stops = [
          [
            stop(-8.5, 6.5, pi, "Checking the filing shelves"),
            stop(-3.6, 4.2, pi / 2, "Checking the next service station"),
          ],
          [
            stop(-9.3, -4.7, 0, "Checking the deposit receipt"),
            stop(-4.9, -2.8, pi, "Waiting for the next counter"),
          ],
          [
            stop(8.2, 6.5, pi, "Checking customer records"),
            stop(3.6, 4.25, -pi / 2, "Checking the service counter"),
          ],
          [
            stop(7.4, -3.8, -pi / 2, "Waiting to use the cash machine"),
            stop(4, -5.5, pi, "Checking the payment receipt"),
          ],
          [
            stop(-4.2, -4.5, pi, "Checking the service queue"),
            stop(-3.1, 0.8, pi, "Waiting beside the service counter"),
          ],
          [
            stop(8.5, -6.4, 0, "Putting the bank card away"),
            stop(4.7, -4.4, pi, "Checking the receipt"),
          ],
        ][i]!;
        break;
      case "hub":
      case "offices":
        stops =
          person.activity === "type"
            ? [
                stop(
                  x < 0 ? -9.5 : 9.5,
                  z - 0.4,
                  x < 0 ? pi / 2 : -pi / 2,
                  "Taking a screen break",
                ),
                stop(
                  x < 0 ? -7.8 : 7.8,
                  7.2,
                  pi,
                  "Checking the filing cabinet",
                ),
              ]
            : [
                stop(x, -4.8, pi, "Checking in with a colleague", "chat"),
                stop(
                  x < -8 ? -9.5 : -3.3,
                  5.9,
                  pi,
                  "Looking for a project file",
                ),
              ];
        break;
      case "lobby":
        stops = [
          [
            stop(-8.6, 4.5, 0, "Checking the reception counter"),
            stop(-3.3, 4.3, pi / 2, "Checking resident requests"),
          ],
          [
            stop(-5, -2.5, pi, "Waiting for reception"),
            stop(-3.2, -4.7, pi, "Checking the lobby noticeboard"),
          ],
          [
            stop(3.6, -3.5, -pi / 2, "Taking a break from reading"),
            stop(8.6, 0, -pi / 2, "Looking out of the lobby window"),
          ],
        ][i]!;
        break;
      case "library":
      case "bookshop":
        stops = [
          [
            stop(-2.8, -1.5, pi / 2, "Choosing a book from the shelves"),
            stop(3.8, -5.6, pi, "Looking for a quiet reading spot"),
          ],
          [
            stop(-2.8, 4.5, pi / 2, "Looking for the next book"),
            stop(8.8, 5.9, pi / 2, "Taking a reading break"),
          ],
          [
            stop(-9.2, 4.4, pi, "Checking the book-return trolley"),
            stop(-6, -4, pi, "Checking returned books"),
          ],
          [
            stop(-5.85, 4.5, -pi / 2, "Browsing another shelf"),
            stop(-5.85, -1.5, -pi / 2, "Looking for a book"),
          ],
        ][i]!;
        break;
      case "cafe":
      case "market":
        stops = [
          [
            stop(-8.5, 7.9, 0, "Checking the back counter"),
            stop(-3.2, 7.9, 0, "Preparing the next order"),
          ],
          [
            stop(-3.7, 3.7, pi, "Waiting for the order"),
            stop(-3.9, -1.8, pi / 2, "Looking for a table"),
          ],
          [
            stop(-9.5, 4.7, -pi / 2, "Checking the menu"),
            stop(-4.8, 4.8, pi, "Waiting to order"),
          ],
          [
            stop(8, -1.4, pi / 2, "Taking a break after the meal"),
            stop(7.6, 4.6, pi / 2, "Saying hello across the tables", "chat"),
          ],
          [
            stop(-8.4, -1.3, -pi / 2, "Stretching after the meal"),
            stop(-9, -5.2, -pi / 2, "Checking the café window"),
          ],
        ][i]!;
        break;
      case "clinic":
        stops = [
          [
            stop(-8.6, -0.5, pi, "Checking the reception supplies"),
            stop(-3, -0.9, pi / 2, "Checking the waiting area"),
          ],
          [
            stop(-4.5, 2.7, pi, "Waiting to be called"),
            stop(-8.7, -5.8, pi, "Checking the appointment note"),
          ],
          [
            stop(-7, 3, 0, "Taking a short waiting-room break"),
            stop(-3.3, 3, pi / 2, "Checking the waiting area"),
          ],
          [
            stop(3.5, 2.9, pi, "Checking the examination supplies"),
            stop(
              4,
              0.7,
              -pi / 2,
              "Checking that the examination room is ready",
            ),
          ],
        ][i]!;
        break;
      case "school":
        stops = person.child
          ? [
              stop(
                x + (x < 0 ? -1.55 : 1.55),
                z + 0.9,
                x < 0 ? -pi / 2 : pi / 2,
                "Comparing lesson notes",
                "chat",
              ),
              stop(x, z - 1.35, pi, "Taking a short stretch break"),
            ]
          : [
              stop(-1.8, 5.6, pi / 2, "Checking the students’ work", "chat"),
              stop(-9, 1.6, -pi / 2, "Helping with a lesson", "chat"),
            ];
        break;
      case "science":
      case "workshop":
        stops = person.task
          ? [
              stop(
                x < 0 ? -9.7 : 9.7,
                z - 0.6,
                x < 0 ? -pi / 2 : pi / 2,
                "Checking the equipment beside the bench",
              ),
              stop(x < 0 ? -3 : 3, 6.1, pi, "Checking the workshop supplies"),
            ]
          : [
              stop(x, 4.7, pi, "Comparing notes with a colleague", "chat"),
              stop(x < -7 ? -9.7 : -3, -5.2, pi, "Checking the next work area"),
            ];
        break;
      case "studios":
        stops = [
          [
            stop(-9.6, -2.7, -pi / 2, "Listening away from the mixing desk"),
            stop(-6, 5, 0, "Checking the studio speakers"),
          ],
          [
            stop(4, 4.3, 0, "Taking a break between takes"),
            stop(8.5, 0.1, pi / 2, "Preparing the next recording"),
          ],
          [
            stop(-3, -5.9, pi, "Reviewing the next take"),
            stop(-4, 5.3, pi / 2, "Discussing the recording", "chat"),
          ],
        ][i]!;
        break;
      case "arts":
        stops = [
          stop(x < 0 ? -8.5 : 8.5, -5.4, pi, "Viewing the next artwork"),
          stop(
            x < 0 ? -3.3 : 3.3,
            5.8,
            pi,
            "Discussing the exhibition",
            "chat",
          ),
        ];
        break;
      case "bus":
        stops = [
          stop(
            i === 0 ? -7 : i === 1 ? 4 : -3,
            1.8,
            pi,
            "Checking the bus route",
          ),
          stop(
            i === 0 ? -8 : i === 1 ? 7 : -5,
            -3.5,
            0,
            "Looking out for the bus",
          ),
        ];
        break;
      case "dock":
        stops = [
          stop(
            i === 0 ? -4.8 : i === 1 ? 3.4 : 8.5,
            5.9,
            pi,
            "Watching the boats along the river",
          ),
          stop(
            i === 0 ? -8 : i === 1 ? 4 : 7,
            -2,
            pi,
            "Stretching along the dock",
          ),
        ];
        break;
      default:
        stops = [
          stop(x < 0 ? -5.5 : 3.2 + i, -2.7, pi, "Looking around the terrace"),
          stop(x < 0 ? -8 : 8.8, 5.8, pi, "Enjoying the view"),
        ];
    }
    return {
      id: `indoor-${person.name.toLowerCase()}-${i}`,
      home: { x, z, yaw: person.yaw },
      seated: person.seat !== undefined,
      label: person.role,
      stops,
      ...(room ? { room } : {}),
    };
  });
}

/** Authored background dialogue, never a claim about the simulation or an AI call. */
export type ConversationLine = Readonly<{
  speaker: string;
  name: string;
  text: string;
}>;
export type ConversationGroup = Readonly<{
  id: string;
  place: string;
  participants: readonly [string, string];
  offset: number;
  day: readonly string[];
  night: readonly string[];
  names: readonly [string, string];
}>;
export const CITY_CONVERSATIONS: readonly ConversationGroup[] = [
  {
    id: "market",
    place: "Market square",
    participants: ["market-amara", "market-ben"],
    names: ["Amara", "Ben"],
    offset: 0,
    day: [
      "The basil smells incredible today.",
      "Try the tomatoes with it. I grew a few on my balcony.",
      "A balcony garden? You'll have to show me.",
    ],
    night: [
      "The market is finally quiet.",
      "Coffee before we head home?",
      "Absolutely. Let's take the riverside path.",
    ],
  },
  {
    id: "school",
    place: "School gardens",
    participants: ["school-teacher-sana", "school-parent-jules"],
    names: ["Sana", "Jules"],
    offset: 13,
    day: [
      "We're planting herbs in the garden this week.",
      "I can bring some rosemary cuttings.",
      "Perfect. The sunny beds would suit them.",
    ],
    night: [
      "It's peaceful here after everyone heads home.",
      "Those lights make the garden path easier to follow.",
      "See you tomorrow, Jules.",
    ],
  },
  {
    id: "river",
    place: "River promenade",
    participants: ["river-reader-iman", "river-child-tomi"],
    names: ["Iman", "Tomi"],
    offset: 27,
    day: [
      "This story is about building a home by the river.",
      "Does their town have a bridge like ours?",
      "It does! That part reminds me of Rivergate.",
    ],
    night: [
      "Look at the lights on the water.",
      "Every reflection moves with the river.",
      "Let's see which ones reach the bridge.",
    ],
  },
];
export const CONVERSATION_CYCLE_SECONDS = 54;
export const CONVERSATION_TURN_SECONDS = 7;
export function sampleConversation(
  group: ConversationGroup,
  seconds: number,
  night: boolean,
): ConversationLine | null {
  const time =
    (Math.max(0, Number.isFinite(seconds) ? seconds : 0) + group.offset) %
    CONVERSATION_CYCLE_SECONDS;
  const turn = Math.floor(time / CONVERSATION_TURN_SECONDS);
  if (turn >= 3) return null;
  // A breathing space between lines keeps both residents from gesturing at once.
  if (time % CONVERSATION_TURN_SECONDS > 6.3) return null;
  const person = turn % 2;
  return {
    speaker: group.participants[person]!,
    name: group.names[person]!,
    text: (night ? group.night : group.day)[turn]!,
  };
}

import {
  CityMetricSchema,
  IdentifierSchema,
  MessageKeySchema,
} from "@terra/campaign-schema";
import { z } from "zod";

import {
  CityGuideRequestSchema,
  SafeCityMemorySchema,
  type CityGuideRequest,
} from "./city-guide";
import { scanProhibitedComputeData } from "./prohibited-data";

export const CITY_GUIDE_RESPONSE_LIMITS = {
  headlineCharacters: 60,
  headlineWords: 8,
  messageCharacters: { "8-10": 260, "11-13": 380 },
  messageWords: { "8-10": 45, "11-13": 65 },
  questionCharacters: 160,
  questionWords: { "8-10": 18, "11-13": 24 },
  hintCharacters: 150,
  hintWords: { "8-10": 18, "11-13": 24 },
  vocabularyEntries: 4,
  vocabularyTermWords: 3,
  vocabularyMeaningWords: { "8-10": 18, "11-13": 24 },
  groundingKeysPerKind: 12,
} as const;

const displayTextSchema = (maximumCharacters: number) =>
  z
    .string()
    .min(1)
    .max(maximumCharacters)
    .refine((value) => value === value.trim(), "Text must be trimmed")
    .refine(
      (value) => !containsUnsupportedControlCharacter(value),
      "Text contains control characters",
    );

const HeadlineSchema = displayTextSchema(
  CITY_GUIDE_RESPONSE_LIMITS.headlineCharacters,
).refine(
  (value) => countWords(value) <= CITY_GUIDE_RESPONSE_LIMITS.headlineWords,
  "Headline is too long",
);

const VocabularyEntrySchema = z
  .object({
    term: displayTextSchema(40).refine(
      (value) =>
        countWords(value) <= CITY_GUIDE_RESPONSE_LIMITS.vocabularyTermWords,
      "Vocabulary term is too long",
    ),
    meaning: displayTextSchema(180),
  })
  .strict();

const ResponseGroundingSchema = z
  .object({
    metricKeys: z
      .array(CityMetricSchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.groundingKeysPerKind)
      .superRefine(uniqueValues("metric key")),
    buildingIds: z
      .array(IdentifierSchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.groundingKeysPerKind)
      .superRefine(uniqueValues("building id")),
    factKeys: z
      .array(MessageKeySchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.groundingKeysPerKind)
      .superRefine(uniqueValues("fact key")),
    messageKeys: z
      .array(MessageKeySchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.groundingKeysPerKind)
      .superRefine(uniqueValues("message key")),
    causeCodes: z
      .array(MessageKeySchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.groundingKeysPerKind)
      .superRefine(uniqueValues("cause code")),
  })
  .strict()
  .refine(
    (grounding) =>
      grounding.metricKeys.length +
        grounding.buildingIds.length +
        grounding.factKeys.length +
        grounding.messageKeys.length +
        grounding.causeCodes.length >
      0,
    "At least one grounding key is required",
  );

/**
 * Strict provider response shape. Task-specific presence rules and age-specific
 * reading limits are enforced by validateCityGuideResponse.
 */
export const CityGuideResponseSchema = z
  .object({
    headline: HeadlineSchema,
    message: displayTextSchema(
      CITY_GUIDE_RESPONSE_LIMITS.messageCharacters["11-13"],
    ),
    reflectiveQuestion: displayTextSchema(
      CITY_GUIDE_RESPONSE_LIMITS.questionCharacters,
    ).optional(),
    hints: z
      .tuple([
        displayTextSchema(CITY_GUIDE_RESPONSE_LIMITS.hintCharacters),
        displayTextSchema(CITY_GUIDE_RESPONSE_LIMITS.hintCharacters),
        displayTextSchema(CITY_GUIDE_RESPONSE_LIMITS.hintCharacters),
      ])
      .refine(
        (hints) => new Set(hints.map((hint) => hint.toLowerCase())).size === 3,
        "Hint ladder entries must be different",
      )
      .optional(),
    vocabulary: z
      .array(VocabularyEntrySchema)
      .max(CITY_GUIDE_RESPONSE_LIMITS.vocabularyEntries)
      .superRefine((entries, context) => {
        const terms = new Set<string>();
        entries.forEach((entry, index) => {
          const term = entry.term.toLowerCase();
          if (terms.has(term)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "term"],
              message: `Duplicate vocabulary term: ${entry.term}`,
            });
          }
          terms.add(term);
        });
      })
      .optional(),
    memoryCandidate: SafeCityMemorySchema.optional(),
    grounding: ResponseGroundingSchema,
  })
  .strict();

export type CityGuideResponse = z.infer<typeof CityGuideResponseSchema>;

export type CityGuideValidationFailureCode =
  | "not-json"
  | "schema-invalid"
  | "wrong-task-shape"
  | "voice-invalid"
  | "reading-limit"
  | "ungrounded"
  | "prohibited-content";

export type CityGuideValidationResult =
  | { readonly ok: true; readonly value: CityGuideResponse }
  | { readonly ok: false; readonly code: CityGuideValidationFailureCode };

export type SafeCityGuideResult =
  | {
      readonly ok: true;
      readonly source: "provider" | "fallback";
      readonly value: CityGuideResponse;
    }
  | { readonly ok: false; readonly source: "none" };

const PROHIBITED_CONTENT_RULES = [
  {
    code: "personal-information-solicitation",
    pattern:
      /\b(?:what(?:'s| is) your (?:name|age|(?:home )?address)|tell me your (?:name|age|school|(?:home )?address)|where do you live|which school do you|send (?:me )?your (?:photo|email|phone|(?:home )?address)|share your (?:name|age|school|location|email|phone|(?:home )?address|wallet))\b/i,
  },
  {
    code: "unsafe-contact-direction",
    pattern:
      /(?:https?:\/\/|www\.|discord|telegram|whatsapp|contact me|call me|text me|message me at|follow me at|@[a-z0-9_]{2,})/i,
  },
  {
    code: "unsafe-topic",
    pattern:
      /\b(?:suicide|self-harm|porn(?:ography)?|sexual act|buy drugs|take drugs|gun|weapon|gambling|place a bet)\b/i,
  },
  {
    code: "simulation-authority-claim",
    pattern:
      /\b(?:i|the ai|the model) (?:built|placed|removed|moved|changed|updated|ran|spent|awarded|increased|decreased|fixed) (?:your|the) (?:city|building|budget|score|simulation|map|indicator|population)\b/i,
  },
] as const;

/** Validates one raw provider result without retaining or returning its text. */
export function validateCityGuideResponse(
  requestInput: unknown,
  providerOutput: unknown,
): CityGuideValidationResult {
  const requestResult = CityGuideRequestSchema.safeParse(requestInput);
  if (!requestResult.success) return { ok: false, code: "ungrounded" };
  if (typeof providerOutput !== "string") {
    return { ok: false, code: "not-json" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(providerOutput) as unknown;
  } catch {
    return { ok: false, code: "not-json" };
  }

  const responseResult = CityGuideResponseSchema.safeParse(parsed);
  if (!responseResult.success) {
    return { ok: false, code: "schema-invalid" };
  }

  const response = responseResult.data;
  if (!matchesTaskShape(requestResult.data, response)) {
    return { ok: false, code: "wrong-task-shape" };
  }
  if (!meetsReadingLimits(requestResult.data, response)) {
    return { ok: false, code: "reading-limit" };
  }
  if (!isGrounded(requestResult.data, response)) {
    return { ok: false, code: "ungrounded" };
  }
  if (!hasSafeContent(response)) {
    return { ok: false, code: "prohibited-content" };
  }
  if (!hasRivergateVoice(response)) {
    return { ok: false, code: "voice-invalid" };
  }

  return { ok: true, value: response };
}

/**
 * Uses provider text only when it passes every check. Invalid output is replaced
 * with the supplied authored fallback; neither raw output nor technical errors
 * are returned to child-facing callers.
 */
export function resolveCityGuideResponse(input: {
  readonly request: unknown;
  readonly providerOutput: unknown;
  readonly fallback: unknown;
}): SafeCityGuideResult {
  const provider = validateCityGuideResponse(
    input.request,
    input.providerOutput,
  );
  if (provider.ok) {
    return { ok: true, source: "provider", value: provider.value };
  }

  const fallback = validateStructuredFallback(input.request, input.fallback);
  if (fallback.ok) {
    return { ok: true, source: "fallback", value: fallback.value };
  }
  return { ok: false, source: "none" };
}

function validateStructuredFallback(
  request: unknown,
  fallback: unknown,
): CityGuideValidationResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(fallback);
  } catch {
    return { ok: false, code: "schema-invalid" };
  }
  return validateCityGuideResponse(request, serialized);
}

function matchesTaskShape(
  request: CityGuideRequest,
  response: CityGuideResponse,
): boolean {
  switch (request.task) {
    case "explain":
      return (
        response.hints === undefined && response.memoryCandidate === undefined
      );
    case "hint":
      return (
        response.hints !== undefined &&
        response.reflectiveQuestion === undefined &&
        response.memoryCandidate === undefined
      );
    case "react":
      return (
        response.reflectiveQuestion === undefined &&
        response.hints === undefined &&
        response.vocabulary === undefined &&
        response.memoryCandidate === undefined
      );
    case "memory":
      return (
        response.reflectiveQuestion === undefined &&
        response.hints === undefined &&
        response.vocabulary === undefined &&
        response.memoryCandidate !== undefined
      );
  }
}

function meetsReadingLimits(
  request: CityGuideRequest,
  response: CityGuideResponse,
): boolean {
  const ageBand = request.ageBand;
  if (
    countWords(response.message) >
      CITY_GUIDE_RESPONSE_LIMITS.messageWords[ageBand] ||
    response.message.length >
      CITY_GUIDE_RESPONSE_LIMITS.messageCharacters[ageBand]
  ) {
    return false;
  }

  if (response.reflectiveQuestion !== undefined) {
    if (
      countWords(response.reflectiveQuestion) >
        CITY_GUIDE_RESPONSE_LIMITS.questionWords[ageBand] ||
      !isSingleQuestion(response.reflectiveQuestion)
    ) {
      return false;
    }
  }

  if (
    response.hints?.some(
      (hint) =>
        countWords(hint) > CITY_GUIDE_RESPONSE_LIMITS.hintWords[ageBand],
    ) === true
  ) {
    return false;
  }

  if (
    response.vocabulary?.some(
      (entry) =>
        countWords(entry.meaning) >
        CITY_GUIDE_RESPONSE_LIMITS.vocabularyMeaningWords[ageBand],
    ) === true
  ) {
    return false;
  }

  return true;
}

function isGrounded(
  request: CityGuideRequest,
  response: CityGuideResponse,
): boolean {
  const allowedMetrics = new Set<string>([
    "population",
    "budget",
    "water",
    "energy",
    "nature",
    "community",
    "resilience",
    ...request.causes.flatMap((cause) =>
      cause.changes.map((change) => change.metric),
    ),
  ]);
  const allowedBuildings = new Set<string>([
    ...request.mission.allowedBuildingIds,
    ...request.before.buildings.map((building) => building.buildingId),
    ...request.after.buildings.map((building) => building.buildingId),
    ...(request.action.type === "place-building"
      ? [request.action.buildingId]
      : []),
    ...request.mission.objectiveConditions.flatMap((condition) =>
      condition.type === "building-count" ? [condition.buildingId] : [],
    ),
  ]);
  const allowedFacts = new Set<string>([
    ...request.allowedFactKeys,
    ...request.relevantMemories.map((memory) => memory.factKey),
  ]);
  const allowedMessages = new Set<string>([
    request.mission.titleKey,
    request.mission.briefingKey,
    ...request.mission.objectiveKeys,
  ]);
  const allowedCauses = new Set(request.causes.map((cause) => cause.code));

  const grounding = response.grounding;
  if (!isSubset(grounding.metricKeys, allowedMetrics)) return false;
  if (!isSubset(grounding.buildingIds, allowedBuildings)) return false;
  if (!isSubset(grounding.factKeys, allowedFacts)) return false;
  if (!isSubset(grounding.messageKeys, allowedMessages)) return false;
  if (!isSubset(grounding.causeCodes, allowedCauses)) return false;

  const declaredNumbers = collectDeclaredNumbers(request);
  if (
    visibleText(response).some((text) =>
      extractNumbers(text).some((number) => !declaredNumbers.has(number)),
    )
  ) {
    return false;
  }

  const memory = response.memoryCandidate;
  if (memory !== undefined) {
    if (!allowedFacts.has(memory.factKey)) return false;
    if (!isSubset(memory.causeCodes, allowedCauses)) return false;
    if (!allowedCauses.has(`milestone.${memory.milestoneId}`)) return false;
    if (memory.earnedTurn !== request.after.turn) return false;
  }
  return true;
}

function hasSafeContent(response: CityGuideResponse): boolean {
  if (scanProhibitedComputeData(response).length > 0) return false;
  return visibleText(response).every((text) =>
    PROHIBITED_CONTENT_RULES.every(({ pattern }) => !pattern.test(text)),
  );
}

function hasRivergateVoice(response: CityGuideResponse): boolean {
  return /\b(?:I|I'm|I've|I'll|me|my|mine|we|we're|we've|we'll|us|our|ours)\b/iu.test(
    response.message,
  );
}

function visibleText(response: CityGuideResponse): readonly string[] {
  return [
    response.headline,
    response.message,
    ...(response.reflectiveQuestion === undefined
      ? []
      : [response.reflectiveQuestion]),
    ...(response.hints ?? []),
    ...(response.vocabulary?.flatMap((entry) => [entry.term, entry.meaning]) ??
      []),
  ];
}

function collectDeclaredNumbers(request: CityGuideRequest): Set<number> {
  const values = new Set<number>();
  const add = (value: number): void => {
    values.add(Object.is(value, -0) ? 0 : value);
  };
  const addSnapshot = (snapshot: CityGuideRequest["before"]): void => {
    add(snapshot.turn);
    add(snapshot.population);
    add(snapshot.budget);
    Object.values(snapshot.indicators).forEach(add);
    Object.values(snapshot.resources).forEach(add);
    snapshot.buildings.forEach((building) => add(building.count));
  };

  addSnapshot(request.before);
  addSnapshot(request.after);
  add(request.action.turn);
  if (request.action.type === "place-building") {
    add(request.action.anchor.x);
    add(request.action.anchor.y);
    add(request.action.rotation);
  }
  request.causes.forEach((cause) =>
    cause.changes.forEach((change) => {
      add(change.before);
      add(change.after);
      add(change.delta);
    }),
  );
  request.mission.objectiveConditions.forEach((condition) => {
    if (
      condition.type === "metric" ||
      condition.type === "building-count" ||
      condition.type === "turn"
    ) {
      add(condition.value);
    }
  });
  return values;
}

function extractNumbers(value: string): readonly number[] {
  return [
    ...value.matchAll(/(?<![\p{L}\p{N}])-?\d+(?:\.\d+)?(?![\p{L}\p{N}])/gu),
  ]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}

function countWords(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function containsUnsupportedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
    );
  });
}

function isSingleQuestion(value: string): boolean {
  return value.endsWith("?") && value.split("?").length === 2;
}

function isSubset(
  values: readonly string[],
  allowed: ReadonlySet<string>,
): boolean {
  return values.every((value) => allowed.has(value));
}

function uniqueValues(label: string) {
  return (values: readonly string[], context: z.RefinementCtx): void => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate ${label}: ${value}`,
        });
      }
      seen.add(value);
    });
  };
}

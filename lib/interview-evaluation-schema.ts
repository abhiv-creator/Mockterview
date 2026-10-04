export type InterviewEvaluation = {
  clarity_score: number;
  filler_words_detected: string[];
  key_technical_points_covered: string[];
  constructive_feedback: string;
};

export const EVALUATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    clarity_score: { type: "integer", minimum: 1, maximum: 10 },
    filler_words_detected: {
      type: "array",
      items: { type: "string", enum: ["um", "uh", "like", "kind of", "sort of", "you know", "basically", "literally", "actually", "i mean", "obviously"] },
      uniqueItems: true,
    },
    key_technical_points_covered: {
      type: "array",
      items: { type: "string", minLength: 1 },
      maxItems: 5,
    },
    constructive_feedback: { type: "string", minLength: 1 },
  },
  required: [
    "clarity_score",
    "filler_words_detected",
    "key_technical_points_covered",
    "constructive_feedback",
  ],
  additionalProperties: false,
} as const;

const EVALUATION_FIELDS = new Set([
  "clarity_score",
  "filler_words_detected",
  "key_technical_points_covered",
  "constructive_feedback",
]);
const FILLER_WORD_SET = new Set<string>(
  EVALUATION_JSON_SCHEMA.properties.filler_words_detected.items.enum,
);

export function validateInterviewEvaluation(input: unknown): InterviewEvaluation | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== EVALUATION_FIELDS.size || keys.some((key) => !EVALUATION_FIELDS.has(key))) {
    return null;
  }

  const { clarity_score, filler_words_detected, key_technical_points_covered, constructive_feedback } =
    candidate;
  if (
    typeof clarity_score !== "number" ||
    !Number.isInteger(clarity_score) ||
    clarity_score < 1 ||
    clarity_score > 10 ||
    !Array.isArray(filler_words_detected) ||
    !filler_words_detected.every(
      (word) => typeof word === "string" && FILLER_WORD_SET.has(word),
    ) ||
    new Set(filler_words_detected).size !== filler_words_detected.length ||
    !Array.isArray(key_technical_points_covered) ||
    key_technical_points_covered.length > 5 ||
    !key_technical_points_covered.every(
      (point) => typeof point === "string" && point.trim().length > 0,
    ) ||
    new Set(key_technical_points_covered).size !== key_technical_points_covered.length ||
    typeof constructive_feedback !== "string" ||
    constructive_feedback.trim().length === 0 ||
    /[\r\n]/.test(constructive_feedback)
  ) {
    return null;
  }

  return {
    clarity_score,
    filler_words_detected,
    key_technical_points_covered,
    constructive_feedback: constructive_feedback.trim(),
  };
}

import { describe, expect, it } from "vitest";
import { identifyAnswerImprovements } from "@/lib/answer-improvements";
import type { InterviewEvaluation } from "@/lib/interview-evaluation-schema";

const evaluation: InterviewEvaluation = {
  clarity_score: 8,
  filler_words_detected: [],
  key_technical_points_covered: [],
  constructive_feedback: "Add detail where it helps.",
};

describe("identifyAnswerImprovements", () => {
  it("identifies missing STAR components and unsupported specifics from the answer", () => {
    const points = identifyAnswerImprovements("I had a difficult problem.", evaluation);

    expect(points).toContain(
      "Set the scene with a brief situation and enough context to understand the challenge.",
    );
    expect(points).toContain(
      "State your specific responsibility or goal so it is clear what you owned.",
    );
    expect(points).toContain(
      "Describe the actions you personally took, using specific first-person examples.",
    );
    expect(points).toContain("Finish with the result or impact; add a concrete metric when you can.");
    expect(points).toContain("Add enough detail to show your reasoning and make the example specific.");
  });

  it("recognizes a complete answer and reports filler words and unclear delivery", () => {
    const completeAnswer =
      "During our project, our goal was to repair a slow service. " +
      "I was responsible for finding why it stalled. " +
      "I analyzed database queries and implemented a cache. " +
      "As a result, I reduced response time by 40%.";
    const points = identifyAnswerImprovements(completeAnswer, {
      ...evaluation,
      clarity_score: 4,
      filler_words_detected: ["um"],
    });

    expect(points).toEqual([
      "Reduce filler words (um) to make key points easier to follow.",
      "Use shorter, clearly ordered sentences to make the explanation easier to follow.",
    ]);
  });

  it("returns a positive note when no major gaps are detected", () => {
    const completeAnswer =
      "During a customer migration project, my task was to fix a service that caused repeated delays. " +
      "I designed and tested a safer cache, then explained the rollout to my team. " +
      "The result was a 30% faster response time with fewer customer complaints.";

    expect(identifyAnswerImprovements(completeAnswer, evaluation)).toEqual([
      "No major gaps were detected. Make the outcome even more memorable with a specific metric or lesson learned.",
    ]);
  });
});

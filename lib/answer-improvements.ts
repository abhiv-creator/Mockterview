import type { InterviewEvaluation } from "@/lib/interview-evaluation-schema";

export function identifyAnswerImprovements(
  transcript: string,
  evaluation: InterviewEvaluation,
): string[] {
  const answer = transcript.trim();
  const improvements: string[] = [];

  if (!/\b(?:situation|context|project|team|when|during|at my|in my)\b/i.test(answer)) {
    improvements.push("Set the scene with a brief situation and enough context to understand the challenge.");
  }

  if (
    !/\b(?:my role|responsible|responsibility|task|goal|needed to|had to|asked me|objective)\b/i.test(
      answer,
    )
  ) {
    improvements.push("State your specific responsibility or goal so it is clear what you owned.");
  }

  if (
    !/\bI\s+(?:built|designed|implemented|analyzed|prioritized|created|led|coordinated|investigated|resolved|optimized|decided|tested|communicated|proposed|wrote|introduced|reduced|improved|chose|used|worked|identified|developed|delivered|organized|negotiated|persuaded|measured|automated)\b/i.test(
      answer,
    )
  ) {
    improvements.push("Describe the actions you personally took, using specific first-person examples.");
  }

  if (
    !/\b(?:result|outcome|impact|improved|reduced|increased|saved|delivered|achieved|grew|cut|learned|\d+(?:\.\d+)?x|%)/i.test(
      answer,
    )
  ) {
    improvements.push("Finish with the result or impact; add a concrete metric when you can.");
  }

  if (answer.split(/\s+/).filter(Boolean).length < 35) {
    improvements.push("Add enough detail to show your reasoning and make the example specific.");
  }

  if (evaluation.filler_words_detected.length > 0) {
    improvements.push(
      `Reduce filler words (${evaluation.filler_words_detected.join(", ")}) to make key points easier to follow.`,
    );
  }

  if (evaluation.clarity_score <= 5) {
    improvements.push("Use shorter, clearly ordered sentences to make the explanation easier to follow.");
  }

  if (improvements.length === 0) {
    improvements.push(
      "No major gaps were detected. Make the outcome even more memorable with a specific metric or lesson learned.",
    );
  }

  return improvements;
}

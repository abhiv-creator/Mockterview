import { Blob as NodeBlob } from "node:buffer";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateInterviewAnswer,
  transcribeAudioInput,
} from "@/lib/interview-evaluator";
import { identifyAnswerImprovements } from "@/lib/answer-improvements";
import { POST } from "@/app/api/evaluate-interview/route";

vi.mock("@/lib/interview-evaluator", () => ({
  evaluateInterviewAnswer: vi.fn(),
  MAX_AUDIO_BYTES: 25 * 1024 * 1024,
  transcribeAudioInput: vi.fn(),
}));

vi.mock("@/lib/answer-improvements", () => ({
  identifyAnswerImprovements: vi.fn(() => ["Add more context."]),
}));

const evaluation = {
  clarity_score: 8,
  filler_words_detected: [],
  key_technical_points_covered: ["Dynamic programming"],
  constructive_feedback: "You connected memoization to repeated subproblems.",
};

function jsonRequest(body: string | unknown, contentType = "application/json") {
  return new NextRequest("http://localhost/api/evaluate-interview", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function multipartAudioRequest() {
  const boundary = "mockterview-test-boundary";
  return new NextRequest("http://localhost/api/evaluate-interview", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: [
      `--${boundary}`,
      'Content-Disposition: form-data; name="audio"; filename="answer.webm"',
      "Content-Type: audio/webm",
      "",
      "recording",
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  });
}

async function responseBody(response: Response) {
  return response.json();
}

describe("POST /api/evaluate-interview", () => {
  beforeEach(() => {
    vi.stubGlobal("Blob", NodeBlob);
    vi.mocked(evaluateInterviewAnswer).mockResolvedValue(evaluation);
    vi.mocked(transcribeAudioInput).mockResolvedValue(null);
    vi.mocked(identifyAnswerImprovements).mockReturnValue(["Add more context."]);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("evaluates a supplied transcript and returns the exact response schema", async () => {
    vi.mocked(evaluateInterviewAnswer).mockResolvedValue(evaluation);
    const response = await POST(jsonRequest({ transcript: "I used memoization." }));

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      evaluation,
      improvement_points: ["Add more context."],
    });
    expect(evaluateInterviewAnswer).toHaveBeenCalledWith("I used memoization.");
    expect(identifyAnswerImprovements).toHaveBeenCalledWith("I used memoization.", evaluation);
    expect(transcribeAudioInput).not.toHaveBeenCalled();
  });

  it("rejects a request with neither a transcript nor audio", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "TRANSCRIPT_OR_AUDIO_REQUIRED" },
    });
    expect(evaluateInterviewAnswer).not.toHaveBeenCalled();
  });

  it.each([
    ["empty transcript", { transcript: "  " }],
    ["non-string transcript", { transcript: 42 }],
    ["non-object JSON", []],
  ])("rejects %s", async (_caseName, body) => {
    const response = await POST(jsonRequest(body));

    expect(response.status).toBe(400);
    expect(evaluateInterviewAnswer).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON with a client error response", async () => {
    const response = await POST(jsonRequest("{", "application/json"));

    expect(response.status).toBe(400);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("rejects unsupported content types", async () => {
    const response = await POST(jsonRequest("transcript", "text/plain"));

    expect(response.status).toBe(415);
    expect(evaluateInterviewAnswer).not.toHaveBeenCalled();
  });

  it("returns an explicit unavailable result rather than evaluating invented audio content", async () => {
    const response = await POST(multipartAudioRequest());

    expect(response.status).toBe(422);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "TRANSCRIPTION_UNAVAILABLE" },
    });
    expect(transcribeAudioInput).toHaveBeenCalledOnce();
    expect(evaluateInterviewAnswer).not.toHaveBeenCalled();
  });

  it("evaluates successfully transcribed audio", async () => {
    vi.mocked(transcribeAudioInput).mockResolvedValue(
      "I used dynamic programming with memoization.",
    );
    const response = await POST(multipartAudioRequest());

    expect(response.status).toBe(200);
    expect(evaluateInterviewAnswer).toHaveBeenCalledWith(
      "I used dynamic programming with memoization.",
    );
  });

  it("returns a bounded client error for oversized transcripts", async () => {
    const response = await POST(jsonRequest({ transcript: "x".repeat(12_001) }));

    expect(response.status).toBe(413);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "TRANSCRIPT_TOO_LONG" },
    });
    expect(evaluateInterviewAnswer).not.toHaveBeenCalled();
  });

  it("returns an explicit server error if evaluation unexpectedly fails", async () => {
    vi.mocked(evaluateInterviewAnswer).mockRejectedValue(new Error("unexpected"));
    const response = await POST(jsonRequest({ transcript: "A real answer." }));

    expect(response.status).toBe(500);
    expect(await responseBody(response)).toMatchObject({
      error: { code: "EVALUATION_FAILED" },
    });
  });
});

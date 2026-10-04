import { NextRequest, NextResponse } from "next/server";
import {
  evaluateInterviewAnswer,
  MAX_AUDIO_BYTES,
  transcribeAudioInput,
} from "@/lib/interview-evaluator";
import { identifyAnswerImprovements } from "@/lib/answer-improvements";

type ErrorCode =
  | "INVALID_REQUEST"
  | "TRANSCRIPT_OR_AUDIO_REQUIRED"
  | "TRANSCRIPTION_UNAVAILABLE"
  | "TRANSCRIPT_TOO_LONG"
  | "EVALUATION_FAILED";

const MAX_TRANSCRIPT_LENGTH = 12_000;

function errorResponse(status: number, code: ErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAudioCandidate(
  payload: Record<string, unknown>,
): Blob | string | ArrayBuffer | Uint8Array | null {
  const candidate =
    payload.audio ??
    payload.audioDataUrl ??
    null;

  if (typeof Blob !== "undefined" && candidate instanceof Blob) return candidate;
  if (typeof candidate === "string") return candidate;
  if (candidate instanceof ArrayBuffer || candidate instanceof Uint8Array) return candidate;

  if (isRecord(candidate)) {
    if (typeof candidate.data === "string") return candidate.data;
    if (typeof Blob !== "undefined" && candidate.blob instanceof Blob) return candidate.blob;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  let payload: Record<string, unknown>;

  try {
    if (contentType.includes("application/json")) {
      const body: unknown = await request.json();
      if (!isRecord(body)) {
        return errorResponse(400, "INVALID_REQUEST", "The request body must be a JSON object.");
      }
      payload = body;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      return errorResponse(
        415,
        "INVALID_REQUEST",
        "Send a JSON transcript or audio as multipart form data.",
      );
    }
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "The request body could not be parsed.");
  }

  let transcript: string | null = null;
  if ("transcript" in payload) {
    if (typeof payload.transcript !== "string" || !payload.transcript.trim()) {
      return errorResponse(400, "INVALID_REQUEST", "Transcript must be a non-empty string.");
    }
    transcript = payload.transcript.trim();
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return errorResponse(
        413,
        "TRANSCRIPT_TOO_LONG",
        `Transcript must be ${MAX_TRANSCRIPT_LENGTH} characters or fewer.`,
      );
    }
  } else {
    const audio = getAudioCandidate(payload);
    if (!audio) {
      return errorResponse(
        400,
        "TRANSCRIPT_OR_AUDIO_REQUIRED",
        "Provide a non-empty transcript or an audio recording to evaluate.",
      );
    }
    if (
      (typeof Blob !== "undefined" && audio instanceof Blob && audio.size > MAX_AUDIO_BYTES) ||
      (typeof audio === "string" && audio.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 100)
    ) {
      return errorResponse(413, "INVALID_REQUEST", "Audio must be 25 MiB or smaller.");
    }
    try {
      transcript = await transcribeAudioInput(audio);
    } catch {
      transcript = null;
    }
    if (!transcript?.trim()) {
      return errorResponse(
        422,
        "TRANSCRIPTION_UNAVAILABLE",
        "Audio could not be transcribed. Configure local Whisper transcription or submit a transcript directly.",
      );
    }
    transcript = transcript.trim();
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return errorResponse(
        413,
        "TRANSCRIPT_TOO_LONG",
        `Transcript must be ${MAX_TRANSCRIPT_LENGTH} characters or fewer.`,
      );
    }
  }

  try {
    const evaluation = await evaluateInterviewAnswer(transcript);
    return NextResponse.json({
      evaluation,
      improvement_points: identifyAnswerImprovements(transcript, evaluation),
    });
  } catch {
    return errorResponse(
      500,
      "EVALUATION_FAILED",
      "The answer could not be evaluated. Please try again.",
    );
  }
}

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoachDashboard } from "@/components/coach-dashboard";

const mockRecorder = vi.hoisted(() => ({
  status: "idle" as "idle" | "recording" | "paused" | "processing" | "stopped",
  error: null as string | null,
  recording: null as { blob: Blob; url: string; durationMs: number } | null,
  elapsedMs: 0,
  analyser: null as AnalyserNode | null,
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/hooks/use-audio-recorder", () => ({
  useAudioRecorder: () => mockRecorder,
}));

describe("CoachDashboard", () => {
  beforeEach(() => {
    Object.assign(mockRecorder, {
      status: "idle",
      error: null,
      recording: null,
      elapsedMs: 0,
      analyser: null,
    });
  });

  it("renders accessible recording controls and changes the feedback category", async () => {
    const user = userEvent.setup();
    render(<CoachDashboard />);

    expect(screen.getByText("Mockterview", { selector: ".brand-lockup__wordmark" })).toBeVisible();
    expect(document.querySelector<HTMLImageElement>(".brand-lockup__logo"))
      .toHaveAttribute("src", expect.stringContaining("mockterview-logo.png"));
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save & evaluate/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Improvement" })).toBeInTheDocument();
    expect(screen.getByText(/record your answer, then choose/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /audio waveform preview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Delivery" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Structure" }));

    expect(screen.getByRole("tab", { name: "Structure" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/signpost the situation and your task/i)).toBeInTheDocument();
  });

  it("reveals additional guidance when the prompt can be changed", async () => {
    const user = userEvent.setup();
    render(<CoachDashboard />);

    await user.click(screen.getByRole("button", { name: /change prompt/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/think about one specific moment/i);
  });

  it("saves a finished take and displays the evaluator's improvement points", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["audio"], { type: "audio/webm" });
    Object.assign(mockRecorder, {
      status: "stopped",
      recording: { blob, url: "blob:practice", durationMs: 45_000 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            evaluation: {
              clarity_score: 6,
              filler_words_detected: ["um"],
              key_technical_points_covered: [],
              constructive_feedback: "Add detail to the result.",
            },
            improvement_points: ["State your role.", "Add a measurable result."],
          }),
        ),
      ),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<CoachDashboard />);
    await user.click(screen.getByRole("button", { name: /save & evaluate/i }));

    await waitFor(() => expect(screen.getByText("State your role.")).toBeInTheDocument());
    expect(screen.getByText("Add a measurable result.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/saved to your downloads/i);
    expect(fetch).toHaveBeenCalledWith(
      "/api/evaluate-interview",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

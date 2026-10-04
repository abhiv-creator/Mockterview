import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    void stream;
    void options;
  }
  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) } as BlobEvent);
    this.state = "inactive";
    this.onstop?.();
  }
}

const mockTrack = { stop: vi.fn() };
const mockStream = {
  getTracks: () => [mockTrack],
} as unknown as MediaStream;

function setGetUserMedia(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

describe("useAudioRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    setGetUserMedia(vi.fn().mockResolvedValue(mockStream));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:practice"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    mockTrack.stop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("moves through recording, paused, resumed, processing, and stopped", async () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.status).toBe("idle");

    await act(async () => result.current.start());
    expect(result.current.status).toBe("recording");

    act(() => result.current.pause());
    expect(result.current.status).toBe("paused");

    act(() => result.current.resume());
    expect(result.current.status).toBe("recording");

    act(() => result.current.stop());
    expect(result.current.status).toBe("processing");
    expect(mockTrack.stop).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(130));
    expect(result.current.status).toBe("stopped");
    expect(result.current.recording?.blob.size).toBeGreaterThan(0);
    expect(result.current.recording?.url).toBe("blob:practice");
  });

  it("reports unsupported recording APIs without requesting microphone access", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const getUserMedia = vi.fn();
    setGetUserMedia(getUserMedia);
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => result.current.start());

    expect(result.current.error).toBe("unsupported");
    expect(result.current.status).toBe("stopped");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports unsupported microphone capture when getUserMedia is unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => result.current.start());

    expect(result.current.error).toBe("unsupported");
    expect(result.current.status).toBe("stopped");
  });

  it("explains when microphone permission is denied", async () => {
    setGetUserMedia(
      vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")),
    );
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => result.current.start());

    expect(result.current.error).toBe("permission-denied");
    expect(result.current.status).toBe("stopped");
  });

  it("reports when no microphone is available", async () => {
    setGetUserMedia(
      vi.fn().mockRejectedValue(new DOMException("No microphone", "NotFoundError")),
    );
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => result.current.start());

    expect(result.current.error).toBe("device-unavailable");
    expect(result.current.status).toBe("stopped");
  });

  it("releases an acquired stream when the hook unmounts", async () => {
    const { result, unmount } = renderHook(() => useAudioRecorder());
    await act(async () => result.current.start());

    unmount();

    expect(mockTrack.stop).toHaveBeenCalledOnce();
  });
});

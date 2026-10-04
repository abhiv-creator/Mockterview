"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "stopped";

export type RecorderError =
  | "unsupported"
  | "permission-denied"
  | "device-unavailable"
  | "capture-failed";

type AudioRecording = {
  blob: Blob;
  url: string;
  durationMs: number;
};

type AudioRecorderResult = {
  status: RecorderStatus;
  error: RecorderError | null;
  recording: AudioRecording | null;
  elapsedMs: number;
  analyser: AnalyserNode | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

const FINALIZE_DELAY_MS = 120;

function getRecorderError(error: unknown): RecorderError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "permission-denied";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "device-unavailable";
    }
  }
  return "capture-failed";
}

function getSupportedMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAudioRecorder(): AudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<RecorderError | null>(null);
  const [recording, setRecording] = useState<AudioRecording | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const recordingUrlRef = useRef<string | null>(null);

  const releaseAudioResources = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setAnalyser(null);
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close();
    }
  }, []);

  const revokeRecordingUrl = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const context = contextRef.current;
      if (context && context.state !== "closed") void context.close();
      contextRef.current = null;
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs(
          accumulatedMsRef.current + performance.now() - startedAtRef.current,
        );
      }
    }, 150);
    return () => window.clearInterval(timer);
  }, [status]);

  const start = useCallback(async () => {
    if (
      startingRef.current ||
      status === "recording" ||
      status === "paused" ||
      status === "processing"
    ) {
      return;
    }

    startingRef.current = true;
    setError(null);
    setRecording(null);
    revokeRecordingUrl();
    setElapsedMs(0);
    accumulatedMsRef.current = 0;
    chunksRef.current = [];

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      startingRef.current = false;
      setError("unsupported");
      setStatus("stopped");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (captureError) {
      startingRef.current = false;
      if (!mountedRef.current) return;
      setError(getRecorderError(captureError));
      setStatus("stopped");
      return;
    }

    if (!mountedRef.current) {
      startingRef.current = false;
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    try {
      const AudioContextClass = window.AudioContext;
      if (AudioContextClass) {
        const context = new AudioContextClass();
        contextRef.current = context;
        const audioAnalyser = context.createAnalyser();
        audioAnalyser.fftSize = 64;
        context.createMediaStreamSource(stream).connect(audioAnalyser);
        analyserRef.current = audioAnalyser;
        setAnalyser(audioAnalyser);
      }
    } catch {
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    }

    try {
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current) return;
        startingRef.current = false;
        setError("capture-failed");
        accumulatedMsRef.current =
          startedAtRef.current === null
            ? accumulatedMsRef.current
            : accumulatedMsRef.current + performance.now() - startedAtRef.current;
        startedAtRef.current = null;
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        releaseAudioResources();
        setStatus("stopped");
      };
      recorder.onstop = () => {
        if (!mountedRef.current) return;
        const durationMs = accumulatedMsRef.current;
        releaseAudioResources();
        let blob: Blob;
        let url: string;
        try {
          blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          if (blob.size === 0) throw new Error("No audio data was recorded.");
          url = URL.createObjectURL(blob);
        } catch {
          setError("capture-failed");
          setStatus("stopped");
          return;
        }
        recordingUrlRef.current = url;
        finalizeTimerRef.current = setTimeout(() => {
          if (!mountedRef.current) {
            URL.revokeObjectURL(url);
            return;
          }
          setRecording({ blob, url, durationMs });
          setStatus("stopped");
        }, FINALIZE_DELAY_MS);
      };
      recorder.start();
      startedAtRef.current = performance.now();
      startingRef.current = false;
      setStatus("recording");
    } catch (recorderError) {
      startingRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      recorderRef.current = null;
      releaseAudioResources();
      if (mountedRef.current) {
        setError(getRecorderError(recorderError));
        setStatus("stopped");
      }
    }
  }, [releaseAudioResources, revokeRecordingUrl, status]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (status !== "recording" || !recorder || recorder.state !== "recording") return;
    accumulatedMsRef.current +=
      startedAtRef.current === null ? 0 : performance.now() - startedAtRef.current;
    startedAtRef.current = null;
    setElapsedMs(accumulatedMsRef.current);
    recorder.pause();
    setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (status !== "paused" || !recorder || recorder.state !== "paused") return;
    startedAtRef.current = performance.now();
    recorder.resume();
    setStatus("recording");
  }, [status]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (
      !recorder ||
      (status !== "recording" && status !== "paused") ||
      recorder.state === "inactive"
    ) {
      return;
    }
    if (startedAtRef.current !== null) {
      accumulatedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setElapsedMs(accumulatedMsRef.current);
    setStatus("processing");
    recorder.stop();
  }, [status]);

  return { status, error, recording, elapsedMs, analyser, start, pause, resume, stop };
}

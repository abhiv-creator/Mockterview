"use client";

import { useEffect, useRef, useState } from "react";

type AudioVisualizerProps = {
  analyser: AnalyserNode | null;
  active: boolean;
};

const BAR_COUNT = 36;

export function AudioVisualizer({ analyser, active }: AudioVisualizerProps) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, (_, index) => 14 + ((index * 7) % 15)),
  );
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !analyser) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      setLevels(
        Array.from({ length: BAR_COUNT }, (_, index) => {
          const value = data[Math.floor((index / BAR_COUNT) * data.length)] ?? 0;
          return Math.max(8, Math.round((value / 255) * 68));
        }),
      );
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [active, analyser]);

  return (
    <div
      className={`waveform${active ? " waveform--active" : ""}`}
      role="img"
      aria-label={active ? "Live audio level visualization" : "Audio waveform preview"}
    >
      {levels.map((level, index) => (
        <span
          key={index}
          className="waveform__bar"
          style={{ height: `${level}px`, animationDelay: `${index * 24}ms` }}
        />
      ))}
    </div>
  );
}

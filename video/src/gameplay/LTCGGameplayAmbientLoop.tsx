import type {FC} from "react";
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const gameplayAmbientFps = 30;
export const gameplayAmbientWidth = 1920;
export const gameplayAmbientHeight = 1080;
export const gameplayAmbientDurationInFrames = 180;

const STAMPS = ["DRAW", "CHAIN", "CLASH", "STACK", "TURN"] as const;

const STAMP_LAYOUT = [
  {left: 6, top: 12, rotate: -7, scale: 1},
  {left: 74, top: 16, rotate: 6, scale: 0.95},
  {left: 16, top: 74, rotate: -5, scale: 0.92},
  {left: 68, top: 78, rotate: 7, scale: 1.04},
  {left: 43, top: 44, rotate: -2, scale: 0.98},
] as const;

export const LTCGGameplayAmbientLoop: FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = frame / durationInFrames;

  const phaseA = progress * Math.PI * 2;
  const phaseB = progress * Math.PI * 4;

  const dotOffsetX = Math.sin(phaseA) * 18;
  const dotOffsetY = Math.cos(phaseA) * 14;
  const paperPulse = 0.88 + Math.sin(phaseA) * 0.07;
  const vignetteOpacity = 0.32 + Math.cos(phaseA) * 0.07;
  const stampOpacity = 0.07 + (Math.sin(phaseB) + 1) * 0.04;

  return (
    <AbsoluteFill style={{backgroundColor: "#fdfdfb", overflow: "hidden"}}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 30% 24%, rgba(255, 204, 0, 0.16), transparent 58%), radial-gradient(circle at 74% 78%, rgba(51, 204, 255, 0.17), transparent 62%)",
          opacity: paperPulse,
        }}
      />

      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(#121212 0.9px, transparent 0.9px)",
          backgroundSize: "18px 18px",
          backgroundPosition: `${dotOffsetX}px ${dotOffsetY}px`,
          opacity: 0.11,
          mixBlendMode: "multiply",
        }}
      />

      {Array.from({length: 6}).map((_, index) => {
        const drift = (index + 1) * 0.7;
        const wave = Math.sin(phaseA + index) * 40;
        return (
          <div
            key={`line-${index}`}
            style={{
              position: "absolute",
              left: -420,
              right: -420,
              top: `${14 + index * 13}%`,
              height: 2,
              transform: `translateX(${wave}px) rotate(${drift}deg)`,
              background:
                "linear-gradient(90deg, transparent, rgba(18, 18, 18, 0.16), transparent)",
            }}
          />
        );
      })}

      {STAMP_LAYOUT.map((slot, index) => {
        const stampJitter = Math.sin(phaseB + index) * 7;
        return (
          <div
            key={`${slot.left}-${slot.top}`}
            style={{
              position: "absolute",
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              transform: `translate(${stampJitter}px, ${-stampJitter * 0.4}px) rotate(${slot.rotate}deg) scale(${slot.scale})`,
              border: "3px solid rgba(18,18,18,0.18)",
              color: "rgba(18,18,18,0.2)",
              background: "rgba(255,255,255,0.22)",
              fontFamily: "Outfit, Arial, sans-serif",
              fontWeight: 900,
              letterSpacing: "0.08em",
              fontSize: 56,
              padding: "10px 24px",
              textTransform: "uppercase",
              opacity: stampOpacity,
              boxShadow: "4px 4px 0 rgba(18,18,18,0.1)",
            }}
          >
            {STAMPS[index % STAMPS.length]}
          </div>
        );
      })}

      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(18,18,18,0.28) 0px, rgba(18,18,18,0.28) 1px, transparent 1px, transparent 5px)",
          mixBlendMode: "multiply",
        }}
      />

      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 180px rgba(18, 18, 18, 0.34)",
          opacity: vignetteOpacity,
        }}
      />

      <AbsoluteFill
        style={{
          border: "5px solid rgba(18, 18, 18, 0.4)",
          opacity: interpolate(Math.sin(phaseA), [-1, 1], [0.6, 0.85], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

import type {FC} from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {nearestAccentInfo} from "./beatMap";

const clampOptions = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

export const HalftoneOverlay: FC<{opacity?: number}> = ({opacity = 0.15}) => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.85, 1.15], clampOptions);
  const dotSize = 9 + Math.sin(frame * 0.05) * 1.4;

  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(20,20,20,0.36) 1.1px, transparent 1.2px)",
        backgroundSize: `${dotSize}px ${dotSize}px`,
        opacity: opacity * pulse,
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }}
    />
  );
};

export const PanelGutterOverlay: FC = () => {
  const frame = useCurrentFrame();
  const jitter = Math.sin(frame * 0.25) * 2.5;
  const lines = [0.33, 0.66];

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <div
        style={{
          position: "absolute",
          inset: 18 + jitter,
          border: "4px solid rgba(16,16,16,0.95)",
          boxShadow: "0 0 0 2px rgba(250,240,170,0.3) inset",
        }}
      />
      {lines.map((x) => (
        <div
          key={`v-${x}`}
          style={{
            position: "absolute",
            top: 36,
            bottom: 36,
            left: `calc(${Math.round(x * 100)}% + ${Math.sin(frame * 0.17 + x) * 4}px)`,
            width: 3,
            background: "rgba(8,8,8,0.55)",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 36,
          right: 36,
          top: `calc(72% + ${Math.cos(frame * 0.2) * 3}px)`,
          height: 3,
          background: "rgba(8,8,8,0.5)",
        }}
      />
    </AbsoluteFill>
  );
};

export const SpeedLinesOverlay: FC<{strength?: number; color?: string}> = ({
  strength = 0.6,
  color = "rgba(255,245,180,0.25)",
}) => {
  const frame = useCurrentFrame();
  const animate = 8 + (frame % 24);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity: strength,
        backgroundImage: [
          `repeating-linear-gradient(78deg, ${color} 0px, ${color} 2px, transparent 2px, transparent 18px)`,
          "radial-gradient(circle at center, transparent 0 25%, rgba(0,0,0,0.42) 100%)",
        ].join(","),
        backgroundPosition: `${animate}px 0, 0 0`,
        mixBlendMode: "screen",
      }}
    />
  );
};

export const BoundaryInkWipe: FC<{boundaries: readonly number[]}> = ({boundaries}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      {boundaries.map((boundary) => {
        const local = frame - boundary;
        if (local < -8 || local > 12) {
          return null;
        }

        const progress = interpolate(local, [-8, 12], [0, 1], clampOptions);
        const y = interpolate(progress, [0, 1], [-180, 180], clampOptions);
        const opacity = interpolate(local, [-8, 0, 12], [0, 0.45, 0], clampOptions);

        return (
          <div
            key={boundary}
            style={{
              position: "absolute",
              inset: 0,
              opacity,
              background:
                "linear-gradient(120deg, rgba(0,0,0,0.95) 0%, rgba(18,18,18,0.9) 30%, rgba(250,240,170,0.45) 50%, rgba(18,18,18,0.9) 70%, rgba(0,0,0,0.95) 100%)",
              transform: `translateY(${y}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const IMPACT_WORDS = ["BAM", "CLASH", "DRAW", "STACK", "SNAP", "HIT", "RUSH"];
const IMPACT_POSITIONS = [
  {left: "8%", top: "14%"},
  {left: "61%", top: "16%"},
  {left: "14%", top: "63%"},
  {left: "64%", top: "66%"},
  {left: "38%", top: "43%"},
];

export const AccentPulseOverlay: FC<{accentFrames: readonly number[]}> = ({accentFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nearest = nearestAccentInfo(frame);
  const accentFrame = accentFrames[nearest.index] ?? nearest.frame;
  const delta = frame - accentFrame;
  const distance = Math.abs(delta);

  if (distance > 7) {
    return null;
  }

  const punch = interpolate(distance, [0, 7], [1, 0], clampOptions);
  const reveal = spring({
    frame: delta + 4,
    fps,
    config: {damping: 16, stiffness: 210},
    durationInFrames: 18,
  });
  const scale = interpolate(reveal, [0, 1], [0.72, 1.08], clampOptions);
  const y = interpolate(reveal, [0, 1], [36, 0], clampOptions);
  const position = IMPACT_POSITIONS[nearest.index % IMPACT_POSITIONS.length];
  const label = IMPACT_WORDS[nearest.index % IMPACT_WORDS.length];
  const textOpacity =
    distance <= 4
      ? interpolate(distance, [0, 4], [1, 0.7], {
          ...clampOptions,
          easing: Easing.out(Easing.cubic),
        })
      : interpolate(distance, [4, 7], [0.7, 0], {
          ...clampOptions,
          easing: Easing.out(Easing.cubic),
        });

  return (
    <AbsoluteFill style={{pointerEvents: "none"}}>
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(255,255,255,${0.18 * punch})`,
          mixBlendMode: "screen",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(255,30,60,${0.14 * punch})`,
          mixBlendMode: "screen",
          transform: "translate(4px, 0)",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: `rgba(40,140,255,${0.13 * punch})`,
          mixBlendMode: "screen",
          transform: "translate(-4px, 0)",
        }}
      />
      <div
        style={{
          position: "absolute",
          ...position,
          opacity: textOpacity,
          color: "#fff8c2",
          fontSize: 80,
          fontWeight: 900,
          fontFamily: "Outfit, Arial, sans-serif",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          textShadow:
            "3px 3px 0 rgba(0,0,0,0.95), -2px -2px 0 rgba(255,0,80,0.45), 2px -2px 0 rgba(40,140,255,0.45)",
          transform: `translateY(${y}px) scale(${scale}) rotate(${(nearest.index % 2 === 0 ? -1 : 1) * 6}deg)`,
          padding: "4px 10px",
          border: "2px solid rgba(255,248,194,0.85)",
          background: "rgba(0,0,0,0.45)",
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

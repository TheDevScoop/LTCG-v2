import { useMemo } from "react";

interface SpeedLinesProps {
  intensity?: 1 | 2 | 3;
  focal?: { x: string; y: string };
  animated?: boolean;
  className?: string;
}

const intensityConfig = {
  1: { steps: 36, opacity: 0.03, degPerStep: 10 },
  2: { steps: 72, opacity: 0.05, degPerStep: 5 },
  3: { steps: 90, opacity: 0.08, degPerStep: 4 },
} as const;

/**
 * Radial manga speed lines using CSS conic-gradient.
 *
 * Creates alternating transparent/dark wedges radiating from a focal point,
 * producing the classic manga "zoom" or "impact" effect. Intensity controls
 * wedge density and opacity. Optional rotation animation.
 *
 * Renders as a pointer-events-none overlay (inset-0, z-0) meant to sit
 * behind content in a position:relative container.
 */
export function SpeedLines({
  intensity = 1,
  focal = { x: "50%", y: "50%" },
  animated = false,
  className = "",
}: SpeedLinesProps) {
  const config = intensityConfig[intensity];

  const gradient = useMemo(() => {
    const stops: string[] = [];
    const wedgeWidth = config.degPerStep;
    const lineWidth = Math.max(0.5, wedgeWidth * 0.3); // line is 30% of the wedge
    const lineColor = `rgba(18, 18, 18, ${config.opacity})`;

    for (let i = 0; i < config.steps; i++) {
      const startAngle = i * wedgeWidth;
      const lineEnd = startAngle + lineWidth;

      stops.push(`transparent ${startAngle}deg`);
      stops.push(`${lineColor} ${startAngle}deg`);
      stops.push(`${lineColor} ${lineEnd}deg`);
      stops.push(`transparent ${lineEnd}deg`);
    }

    return `conic-gradient(from 0deg at ${focal.x} ${focal.y}, ${stops.join(", ")})`;
  }, [config, focal.x, focal.y]);

  const animationName = "speed-lines-rotate";

  return (
    <>
      {animated && (
        <style>{`
          @keyframes ${animationName} {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .speed-lines-animated {
              animation: none !important;
            }
          }
        `}</style>
      )}
      <div
        aria-hidden
        className={`speed-lines-overlay ${animated ? "speed-lines-animated" : ""} ${className}`}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: gradient,
          ...(animated
            ? {
                animation: `${animationName} 20s linear infinite`,
              }
            : {}),
        }}
      />
    </>
  );
}

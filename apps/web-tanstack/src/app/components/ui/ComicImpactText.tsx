import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

interface ComicImpactTextProps {
  text: string;
  color?: string;
  rotation?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  animate?: boolean;
}

const sizeMap = {
  sm: "2rem", // 32px
  md: "3rem", // 48px
  lg: "4.5rem", // 72px
} as const;

/**
 * Onomatopoeia stamp text for comic impact moments.
 *
 * Renders large bold outlined text with multi-layer shadows, mimicking
 * hand-stamped comic book sound effects (POW, WHAM, CRACK, etc.).
 *
 * Uses Outfit black weight, uppercase, with -webkit-text-stroke for the
 * thick ink outline and layered text-shadow for the chunky offset.
 */
export function ComicImpactText({
  text,
  color = "#fdfdfb",
  rotation,
  size = "md",
  className = "",
  animate = false,
}: ComicImpactTextProps) {
  const prefersReducedMotion = useReducedMotion();

  // Deterministic rotation from text content if not specified
  const resolvedRotation = useMemo(() => {
    if (rotation !== undefined) return rotation;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    // Map hash to range -8 to 8
    return ((Math.abs(hash) % 17) - 8);
  }, [text, rotation]);

  const shouldAnimate = animate && !prefersReducedMotion;

  const motionProps = shouldAnimate
    ? {
        initial: {
          scale: 0,
          rotate: resolvedRotation - 15,
          opacity: 0,
        },
        animate: {
          scale: [0, 1.3, 1.0],
          rotate: [resolvedRotation - 15, resolvedRotation + 5, resolvedRotation],
          opacity: 1,
        },
        transition: {
          type: "spring" as const,
          stiffness: 300,
          damping: 12,
          mass: 0.8,
        },
      }
    : {
        style: {
          transform: `rotate(${resolvedRotation}deg)`,
        },
      };

  return (
    <motion.span
      className={`inline-block select-none ${className}`}
      aria-label={text}
      {...motionProps}
      style={{
        fontFamily: '"Outfit", "Inter", sans-serif',
        fontWeight: 900,
        fontSize: sizeMap[size],
        textTransform: "uppercase" as const,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        color,
        WebkitTextStroke: "2px #121212",
        textShadow: [
          "3px 3px 0 #121212",
          "-1px -1px 0 #121212",
          "1px -1px 0 #121212",
          "-1px 1px 0 #121212",
        ].join(", "),
        whiteSpace: "nowrap",
        ...(!shouldAnimate ? { transform: `rotate(${resolvedRotation}deg)` } : {}),
        ...(motionProps as { style?: React.CSSProperties }).style,
      }}
    >
      {text}
    </motion.span>
  );
}

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

interface StickerBadgeProps {
  label: string;
  variant?: "stamp" | "label" | "tag";
  rotation?: number;
  className?: string;
  pulse?: boolean;
}

const variantStyles = {
  stamp: {
    backgroundColor: "#ef4444",
    color: "#ffffff",
    borderColor: "#121212",
  },
  label: {
    backgroundColor: "#ffcc00",
    color: "#121212",
    borderColor: "#121212",
  },
  tag: {
    backgroundColor: "#fdfdfb",
    color: "#121212",
    borderColor: "#121212",
  },
} as const;

/**
 * Derive a deterministic rotation angle from a string.
 * Maps to range -5 to 5 degrees for subtle, consistent tilt.
 */
function hashRotation(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return ((Math.abs(hash) % 11) - 5);
}

/**
 * Rotated sticker/label badges inspired by Persona 5 star bursts.
 *
 * Three variants:
 * - "stamp": Red background, white text -- SECRET / CLASSIFIED feel
 * - "label": Yellow background, black text -- highlight / callout
 * - "tag": White background with thin border -- neutral tag
 *
 * Each badge gets a slight rotation derived from the label text (deterministic),
 * overridable via the rotation prop. Hover lifts and twists slightly.
 * Optional pulse animation for drawing attention.
 */
export function StickerBadge({
  label,
  variant = "label",
  rotation,
  className = "",
  pulse = false,
}: StickerBadgeProps) {
  const prefersReducedMotion = useReducedMotion();

  const resolvedRotation = useMemo(
    () => (rotation !== undefined ? rotation : hashRotation(label)),
    [rotation, label],
  );

  const colors = variantStyles[variant];
  const shouldPulse = pulse && !prefersReducedMotion;

  const pulseAnimation = shouldPulse
    ? {
        animate: { scale: [1, 1.05, 1] },
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut" as const,
        },
      }
    : {};

  return (
    <motion.span
      className={`sticker-badge ${className}`}
      role="status"
      {...pulseAnimation}
      style={{
        display: "inline-block",
        fontFamily: '"Outfit", "Inter", sans-serif',
        fontWeight: 700,
        fontSize: "0.75rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        lineHeight: 1.4,
        padding: "2px 10px",
        border: `2px solid ${colors.borderColor}`,
        boxShadow: "var(--shadow-zine-sm)",
        backgroundColor: colors.backgroundColor,
        color: colors.color,
        transform: `rotate(${resolvedRotation}deg)`,
        transition: "transform 150ms ease-out, box-shadow 150ms ease-out",
        cursor: "default",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      whileHover={
        prefersReducedMotion
          ? undefined
          : {
              rotate: resolvedRotation + 2,
              scale: 1.05,
              transition: { duration: 0.15 },
            }
      }
    >
      {label}
    </motion.span>
  );
}

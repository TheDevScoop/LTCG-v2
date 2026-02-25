import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface SkewedPanelProps extends HTMLMotionProps<"div"> {
  direction?: "left" | "right";
  accent?: string;
  children: React.ReactNode;
}

const clipPaths = {
  left: "polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)",
  right: "polygon(0% 0%, calc(100% - 12px) 0%, 100% 100%, 12px 100%)",
} as const;

/**
 * Persona 5-inspired parallelogram container using CSS clip-path.
 *
 * Uses a skewed polygon shape with an optional colored accent strip
 * on the leading edge. Direction controls which way the parallelogram leans.
 */
export const SkewedPanel = forwardRef<HTMLDivElement, SkewedPanelProps>(
  function SkewedPanel(
    { direction = "left", accent, children, style, className = "", ...rest },
    ref,
  ) {
    // The accent strip sits on the leading (skewed) edge
    const accentPosition =
      direction === "left"
        ? { left: 0, top: 0, bottom: 0, width: "4px" }
        : { right: 0, top: 0, bottom: 0, width: "4px" };

    return (
      <motion.div
        ref={ref}
        className={`relative ${className}`}
        style={{
          clipPath: clipPaths[direction],
          border: "2px solid #121212",
          boxShadow: "var(--shadow-zine-sm)",
          backgroundColor: "#fdfdfb",
          ...style,
        }}
        {...rest}
      >
        {/* Accent strip on the skewed edge */}
        {accent && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              ...accentPosition,
              backgroundColor: accent,
              zIndex: 1,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Content wrapper with padding to avoid clipping text at edges */}
        <div style={{ position: "relative", zIndex: 2, padding: "12px 24px" }}>
          {children}
        </div>
      </motion.div>
    );
  },
);

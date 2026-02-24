import { motion } from "framer-motion";

interface SpeechBubbleProps {
  variant?: "speech" | "burst" | "wavy" | "thought";
  tail?: "left" | "right" | "bottom" | "none";
  children: React.ReactNode;
  className?: string;
  animate?: boolean;
}

/**
 * Comic-style speech bubbles with CSS-only tails and variant shapes.
 *
 * - "speech": standard rectangle with triangular tail
 * - "burst": jagged starburst border via clip-path
 * - "wavy": wobbly border using chained border-radius values
 * - "thought": rounded bubble with small trailing circles
 *
 * Text renders in Special Elite (typewriter cursive) for zine feel.
 */
export function SpeechBubble({
  variant = "speech",
  tail = "left",
  children,
  className = "",
  animate = false,
}: SpeechBubbleProps) {
  const pulseAnimation = animate
    ? {
        animate: { scale: [1, 1.02, 1] },
        transition: { duration: 3, repeat: Infinity, ease: "easeInOut" as const },
      }
    : {};

  return (
    <motion.div
      className={`speech-bubble speech-bubble--${variant} speech-bubble--tail-${tail} ${className}`}
      {...pulseAnimation}
    >
      <style>{speechBubbleStyles}</style>
      <div className="speech-bubble__content">{children}</div>
    </motion.div>
  );
}

// Generate the jagged burst clip-path polygon points
function generateBurstClipPath(): string {
  const points: string[] = [];
  const steps = 24;
  const outerRadius = 50;
  const innerRadius = 42;

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 360;
    const rad = (angle * Math.PI) / 180;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const x = 50 + r * Math.cos(rad);
    const y = 50 + r * Math.sin(rad);
    points.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
  }

  return `polygon(${points.join(", ")})`;
}

const burstClip = generateBurstClipPath();

const speechBubbleStyles = /* css */ `
  .speech-bubble {
    position: relative;
    display: inline-block;
    max-width: 320px;
  }

  .speech-bubble__content {
    position: relative;
    padding: 16px 20px;
    font-family: "Special Elite", cursive;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #121212;
    z-index: 1;
  }

  /* === SPEECH (default) === */
  .speech-bubble--speech {
    background-color: #fdfdfb;
    border: 2px solid #121212;
    box-shadow: var(--shadow-zine-sm);
  }

  /* Tail triangles via ::after */
  .speech-bubble--speech.speech-bubble--tail-left::after,
  .speech-bubble--speech.speech-bubble--tail-right::after,
  .speech-bubble--speech.speech-bubble--tail-bottom::after {
    content: "";
    position: absolute;
    width: 0;
    height: 0;
  }

  .speech-bubble--speech.speech-bubble--tail-left::after {
    bottom: -12px;
    left: 20px;
    border-left: 12px solid transparent;
    border-right: 0px solid transparent;
    border-top: 12px solid #121212;
  }
  /* Inner white triangle to create bordered look */
  .speech-bubble--speech.speech-bubble--tail-left::before {
    content: "";
    position: absolute;
    bottom: -8px;
    left: 22px;
    width: 0;
    height: 0;
    border-left: 9px solid transparent;
    border-right: 0px solid transparent;
    border-top: 9px solid #fdfdfb;
    z-index: 2;
  }

  .speech-bubble--speech.speech-bubble--tail-right::after {
    bottom: -12px;
    right: 20px;
    border-right: 12px solid transparent;
    border-left: 0px solid transparent;
    border-top: 12px solid #121212;
  }
  .speech-bubble--speech.speech-bubble--tail-right::before {
    content: "";
    position: absolute;
    bottom: -8px;
    right: 22px;
    width: 0;
    height: 0;
    border-right: 9px solid transparent;
    border-left: 0px solid transparent;
    border-top: 9px solid #fdfdfb;
    z-index: 2;
  }

  .speech-bubble--speech.speech-bubble--tail-bottom::after {
    bottom: -12px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 12px solid #121212;
  }
  .speech-bubble--speech.speech-bubble--tail-bottom::before {
    content: "";
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 9px solid #fdfdfb;
    z-index: 2;
  }

  /* === BURST === */
  .speech-bubble--burst {
    background-color: #fdfdfb;
    clip-path: ${burstClip};
    filter: drop-shadow(2px 2px 0px #121212);
    padding: 12px;
  }
  .speech-bubble--burst .speech-bubble__content {
    padding: 24px 28px;
    text-align: center;
    font-weight: 700;
  }

  /* === WAVY === */
  .speech-bubble--wavy {
    background-color: #fdfdfb;
    border: 2px solid #121212;
    box-shadow: var(--shadow-zine-sm);
    border-radius: 40% 60% 55% 45% / 50% 40% 60% 50%;
  }
  .speech-bubble--wavy .speech-bubble__content {
    padding: 24px 28px;
  }

  /* === THOUGHT === */
  .speech-bubble--thought {
    background-color: #fdfdfb;
    border: 2px solid #121212;
    box-shadow: var(--shadow-zine-sm);
    border-radius: 50%;
  }
  .speech-bubble--thought .speech-bubble__content {
    padding: 28px 32px;
    text-align: center;
  }

  /* Thought bubble trailing circles */
  .speech-bubble--thought.speech-bubble--tail-left::after,
  .speech-bubble--thought.speech-bubble--tail-right::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fdfdfb;
    border: 2px solid #121212;
    border-radius: 50%;
  }
  .speech-bubble--thought.speech-bubble--tail-left::before,
  .speech-bubble--thought.speech-bubble--tail-right::before {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fdfdfb;
    border: 2px solid #121212;
    border-radius: 50%;
    z-index: 0;
  }

  .speech-bubble--thought.speech-bubble--tail-left::after {
    bottom: -16px;
    left: 24px;
  }
  .speech-bubble--thought.speech-bubble--tail-left::before {
    bottom: -28px;
    left: 16px;
  }

  .speech-bubble--thought.speech-bubble--tail-right::after {
    bottom: -16px;
    right: 24px;
  }
  .speech-bubble--thought.speech-bubble--tail-right::before {
    bottom: -28px;
    right: 16px;
  }

  .speech-bubble--thought.speech-bubble--tail-bottom::after {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fdfdfb;
    border: 2px solid #121212;
    border-radius: 50%;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
  }
  .speech-bubble--thought.speech-bubble--tail-bottom::before {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fdfdfb;
    border: 2px solid #121212;
    border-radius: 50%;
    bottom: -28px;
    left: 50%;
    transform: translateX(-6px);
    z-index: 0;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .speech-bubble {
      animation: none !important;
    }
  }
`;

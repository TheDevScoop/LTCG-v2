import { useMemo, useEffect, useRef, useState } from "react";

interface ParticleConfig {
  id: number;
  left: number;   // percent 5–95
  size: number;   // px 2–4
  duration: number; // s 5–9
  delay: number;  // s 0–8
}

// Seeded pseudo-random so the particle layout is stable across re-renders
// but different each mount (seed driven by Date.now() at memo time).
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateParticles(count: number): ParticleConfig[] {
  const rand = seededRandom(Date.now() & 0xffff);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left:     5  + rand() * 90,   // 5–95 %
    size:     2  + rand() * 2,    // 2–4 px
    duration: 5  + rand() * 4,    // 5–9 s
    delay:    rand() * 8,         // 0–8 s
  }));
}

// SVG noise data-URI — matches scanner-noise::after in globals.css
// baseFrequency 0.8, numOctaves 4, opacity 0.04, mix-blend-mode multiply
const NOISE_SRC =
  "data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmbientBackgroundProps {
  /** "dark" → light particles on dark bg (default). "light" → dark particles on light bg. */
  variant?: "light" | "dark";
  /** Render the SVG fractalNoise scanner overlay. Default: true */
  noise?: boolean;
  /** Translate particle layer on scroll (0.3× speed). Default: false */
  parallax?: boolean;
  /** Extra classes applied to the outer wrapper. */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AmbientBackground({
  variant = "dark",
  noise = true,
  parallax = false,
  className,
}: AmbientBackgroundProps) {
  const PARTICLE_COUNT = 13; // 12–15 range; 13 gives good spread

  const particles = useMemo<ParticleConfig[]>(
    () => generateParticles(PARTICLE_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // generate once per mount
  );

  // ── Parallax ──────────────────────────────────────────────────────────────
  const particleLayerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!parallax || prefersReduced) return;

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (particleLayerRef.current) {
          const offset = window.scrollY * 0.3;
          particleLayerRef.current.style.transform = `translateY(${offset}px)`;
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [parallax, prefersReduced]);

  // ── Particle colour ───────────────────────────────────────────────────────
  // "dark" variant: light/white particles (mirrors .chalk-particle in globals)
  // "light" variant: dark/ink particles
  const particleColor =
    variant === "dark"
      ? "rgba(255, 255, 255, 0.22)"
      : "rgba(18, 18, 18, 0.15)";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {/* Floating ink particles */}
      <div
        ref={particleLayerRef}
        style={{ position: "absolute", inset: 0 }}
      >
        {particles.map((p) => (
          <span
            key={p.id}
            className="chalk-particle"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: particleColor,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Scanner noise overlay */}
      {noise && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${NOISE_SRC}")`,
            backgroundRepeat: "repeat",
            backgroundSize: "200px 200px",
            opacity: 0.04,
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

export default AmbientBackground;

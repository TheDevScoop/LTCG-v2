import { useMemo } from "react";

interface ScatterElement {
  src: string;
  size?: number;
  rotation?: number;
  opacity?: number;
}

interface DecorativeScatterProps {
  elements: ScatterElement[];
  density?: number;
  seed?: number;
  className?: string;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Produces deterministic values in [0, 1) for a given seed,
 * so scatter layouts are consistent across re-renders.
 */
function createSeededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fills gutters and margins with randomly positioned decorative images.
 *
 * Uses a seeded PRNG for deterministic layout -- the same seed always
 * produces the same positions, rotations, and opacities. Elements are
 * distributed across a virtual grid to prevent clustering.
 *
 * Renders as a pointer-events-none overlay with content-visibility: auto
 * for lazy rendering performance.
 */
export function DecorativeScatter({
  elements,
  density,
  seed = 42,
  className = "",
}: DecorativeScatterProps) {
  const count = density ?? elements.length;

  const placedElements = useMemo(() => {
    if (elements.length === 0 || count === 0) return [];

    const rand = createSeededRandom(seed);

    // Divide into a grid to avoid clustering
    // Use a roughly square grid with cells based on count
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;

    const result: Array<{
      key: string;
      src: string;
      top: string;
      left: string;
      size: number;
      rotation: number;
      opacity: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const el = elements[i % elements.length]!;
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Position within the grid cell with jitter
      const jitterX = rand() * 0.8 + 0.1; // 10%-90% within cell
      const jitterY = rand() * 0.8 + 0.1;
      const left = cellWidth * col + cellWidth * jitterX;
      const top = cellHeight * row + cellHeight * jitterY;

      // Rotation: use element's rotation or generate random -15 to 15
      const rotation =
        el.rotation !== undefined
          ? el.rotation
          : Math.floor(rand() * 31) - 15;

      // Opacity: use element's opacity or generate random 0.3-0.7
      const opacity =
        el.opacity !== undefined ? el.opacity : rand() * 0.4 + 0.3;

      const size = el.size ?? 48;

      result.push({
        key: `scatter-${seed}-${i}`,
        src: el.src,
        top: `${top.toFixed(1)}%`,
        left: `${left.toFixed(1)}%`,
        size,
        rotation,
        opacity,
      });
    }

    return result;
  }, [elements, count, seed]);

  if (placedElements.length === 0) return null;

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        contentVisibility: "auto",
      }}
    >
      {placedElements.map((item) => (
        <img
          key={item.key}
          src={item.src}
          alt=""
          draggable={false}
          loading="lazy"
          style={{
            position: "absolute",
            top: item.top,
            left: item.left,
            width: `${item.size}px`,
            height: "auto",
            transform: `rotate(${item.rotation}deg) translate(-50%, -50%)`,
            opacity: item.opacity,
            userSelect: "none",
          }}
        />
      ))}
    </div>
  );
}

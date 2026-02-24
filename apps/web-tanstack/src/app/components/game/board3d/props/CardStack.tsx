import { useMemo } from "react";

interface CardStackProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** Number of cards in stack (affects height) */
  count?: number;
  /** Card back color */
  color?: string;
}

/**
 * Stack of cards for deck zone.
 * Slightly fanned/offset cards for realism. ~200 triangles.
 */
export function CardStack({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  count = 20,
  color = "#1a1714",
}: CardStackProps) {
  const cardThickness = 0.003;
  const stackHeight = Math.min(count, 40) * cardThickness;
  const cardW = 0.45;
  const cardH = 0.65;

  // Create slightly offset cards for visual interest
  const cards = useMemo(() => {
    const result: Array<{
      y: number;
      offsetX: number;
      offsetZ: number;
      rotY: number;
    }> = [];

    // Only render visible cards (top few + bulk)
    const visibleCount = Math.min(count, 8);
    for (let i = 0; i < visibleCount; i++) {
      const t = i / Math.max(visibleCount - 1, 1);
      result.push({
        y: t * stackHeight,
        offsetX: (Math.sin(i * 1.7) * 0.003),
        offsetZ: (Math.cos(i * 2.3) * 0.003),
        rotY: (Math.sin(i * 0.8) * 0.02),
      });
    }
    return result;
  }, [count, stackHeight]);

  return (
    <group position={position} rotation={rotation}>
      {/* Bulk of deck — single box */}
      {count > 8 && (
        <mesh position={[0, stackHeight * 0.3, 0]}>
          <boxGeometry args={[cardW, stackHeight * 0.6, cardH]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      )}

      {/* Individual visible cards on top */}
      {cards.map((card, i) => (
        <mesh
          key={i}
          position={[
            card.offsetX,
            count > 8 ? stackHeight * 0.6 + i * cardThickness : card.y,
            card.offsetZ,
          ]}
          rotation={[0, card.rotY, 0]}
        >
          <boxGeometry args={[cardW, cardThickness, cardH]} />
          <meshStandardMaterial
            color={i === cards.length - 1 ? "#2a2420" : color}
            roughness={0.8}
          />
        </mesh>
      ))}

      {/* Gold edge accent on top card */}
      <mesh
        position={[
          cards[cards.length - 1]?.offsetX ?? 0,
          (count > 8 ? stackHeight * 0.6 + (cards.length - 1) * cardThickness : stackHeight) + cardThickness * 0.6,
          cards[cards.length - 1]?.offsetZ ?? 0,
        ]}
      >
        <boxGeometry args={[cardW * 0.85, 0.001, cardH * 0.85]} />
        <meshStandardMaterial
          color="#8b7a2e"
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

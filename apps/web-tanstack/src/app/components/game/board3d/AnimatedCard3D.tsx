import { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { Card3D } from "./Card3D";
import { SummonRing } from "./effects/SummonRing";

interface AnimatedCard3DProps {
  cardId: string;
  definitionId: string;
  cardDef?: any;
  position: [number, number, number];
  faceDown?: boolean;
  cardPosition?: "attack" | "defense";
  highlight?: boolean;
  viceCounters?: number;
  temporaryBoosts?: { attack?: number; defense?: number };
  onClick?: (cardId: string) => void;
  interactive?: boolean;
  disabled?: boolean;
  /** Set to true to skip entrance animation (e.g. initial board load) */
  skipEntrance?: boolean;
}

const ENTRANCE_DURATION = 0.6; // seconds
const ENTRANCE_HEIGHT = 3; // start this high above final position
const ENTRANCE_OVERSHOOT = 0.08; // spring overshoot amount

/**
 * Wraps Card3D with entrance animation.
 * New cards fly in from above with spring physics and a summon ring.
 */
export function AnimatedCard3D({
  position,
  skipEntrance = false,
  cardDef,
  ...cardProps
}: AnimatedCard3DProps) {
  const wrapperRef = useRef<THREE.Group>(null);
  const [showRing, setShowRing] = useState(false);
  const entranceDoneRef = useRef(skipEntrance);
  const progressRef = useRef(skipEntrance ? 1 : 0);
  const mountTimeRef = useRef<number | null>(null);

  // Reset entrance on cardId change (new card summoned to this slot)
  useEffect(() => {
    if (skipEntrance) {
      progressRef.current = 1;
      entranceDoneRef.current = true;
      return;
    }
    progressRef.current = 0;
    entranceDoneRef.current = false;
    mountTimeRef.current = null;
  }, [cardProps.cardId, skipEntrance]);

  useFrame(({ clock }) => {
    if (!wrapperRef.current || entranceDoneRef.current) return;

    if (mountTimeRef.current === null) {
      mountTimeRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - mountTimeRef.current;
    const t = Math.min(elapsed / ENTRANCE_DURATION, 1);
    progressRef.current = t;

    // Spring easing — overshoot then settle
    const spring = t < 0.7
      ? easeOutCubic(t / 0.7)
      : 1 + Math.sin((t - 0.7) / 0.3 * Math.PI) * ENTRANCE_OVERSHOOT * (1 - t);

    // Animate Y position from high to target
    const startY = position[1] + ENTRANCE_HEIGHT;
    const endY = position[1];
    wrapperRef.current.position.y = startY + (endY - startY) * spring;

    // Animate scale from 0.3 to 1
    const scale = 0.3 + 0.7 * spring;
    wrapperRef.current.scale.set(scale, scale, scale);

    // Animate opacity (slight fade-in)
    // Can't easily animate material opacity across Card3D, so just use scale

    if (t >= 1) {
      entranceDoneRef.current = true;
      wrapperRef.current.position.y = position[1];
      wrapperRef.current.scale.set(1, 1, 1);
      // Show summon ring after landing
      setShowRing(true);
    }
  });

  // Get archetype color for summon ring
  const ringColor = cardDef?.archetype
    ? getArchetypeRingColor(cardDef.archetype)
    : "#ffcc00";

  return (
    <group ref={wrapperRef} position={[position[0], position[1], position[2]]}>
      <Card3D
        position={[0, 0, 0]}
        cardDef={cardDef}
        {...cardProps}
      />
      {showRing && (
        <SummonRing
          position={[0, 0, 0]}
          color={ringColor}
          onComplete={() => setShowRing(false)}
        />
      )}
    </group>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const RING_COLORS: Record<string, string> = {
  dropout: "#ef4444",
  prep: "#3b82f6",
  geek: "#eab308",
  freak: "#a855f7",
  nerd: "#22c55e",
  goodie_two_shoes: "#9ca3af",
};

function getArchetypeRingColor(archetype: string): string {
  const key = archetype.toLowerCase().replace(/\s+/g, "_");
  return RING_COLORS[key] ?? "#ffcc00";
}

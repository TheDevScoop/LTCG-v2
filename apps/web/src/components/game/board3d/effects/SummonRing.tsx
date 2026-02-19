import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SummonRingProps {
  position: [number, number, number];
  color?: string;
  onComplete?: () => void;
}

/**
 * Expanding ring effect that plays when a card is summoned.
 * Torus geometry that expands outward and fades.
 */
export function SummonRing({ position, color = "#ffcc00", onComplete }: SummonRingProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    if (!ringRef.current || completedRef.current) return;

    progressRef.current += delta * 2; // ~0.5 second duration
    const t = Math.min(progressRef.current, 1);

    // Scale outward
    const scale = 0.2 + t * 1.5;
    ringRef.current.scale.set(scale, scale, scale);

    // Fade out
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 1 - t;

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={[position[0], position[1] + 0.05, position[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <torusGeometry args={[0.5, 0.02, 8, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

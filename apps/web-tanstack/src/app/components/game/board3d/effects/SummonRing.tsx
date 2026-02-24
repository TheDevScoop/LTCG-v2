import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";

interface SummonRingProps {
  position: [number, number, number];
  color?: string;
  onComplete?: () => void;
}

/**
 * Expanding ring effect that plays when a card is summoned.
 * Torus geometry that expands outward and fades.
 * Opacity driven by TSL uniform (updated from JS); scale via useFrame.
 */
export function SummonRing({ position, color = "#ffcc00", onComplete }: SummonRingProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);

  const opacityUniform = useMemo(() => uniform(1), []);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color(color),
      transparent: true,
      side: THREE.DoubleSide,
    });
    mat.opacityNode = opacityUniform;
    return mat;
  }, [color, opacityUniform]);

  useFrame((_, delta) => {
    if (!ringRef.current || completedRef.current) return;

    progressRef.current += delta * 2; // ~0.5 second duration
    const t = Math.min(progressRef.current, 1);

    // Scale outward
    const scale = 0.2 + t * 1.5;
    ringRef.current.scale.set(scale, scale, scale);

    // Fade out via uniform
    opacityUniform.value = 1 - t;

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
      <primitive object={material} attach="material" />
    </mesh>
  );
}

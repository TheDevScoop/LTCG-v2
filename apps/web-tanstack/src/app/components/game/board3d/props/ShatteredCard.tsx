import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";

interface ShatteredCardProps {
  position?: [number, number, number];
  /** Color of the card fragments */
  color?: string;
  /** Called when animation completes */
  onComplete?: () => void;
}

const FRAGMENT_COUNT = 8;
const DURATION = 0.8; // seconds
const CARD_W = 0.7;
const CARD_H = 1.0;

/**
 * Card destruction effect — card shatters into fragments that fly outward.
 * Self-removes after animation via onComplete callback.
 */
export function ShatteredCard({
  position = [0, 0, 0],
  color = "#2a2420",
  onComplete,
}: ShatteredCardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const startTimeRef = useRef<number | null>(null);

  // Generate random fragment shapes and velocities
  const fragments = useMemo(() => {
    return Array.from({ length: FRAGMENT_COUNT }, (_, i) => {
      const angle = (i / FRAGMENT_COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 1.5 + Math.random() * 2;

      // Random quad-ish shape for each fragment
      const w = 0.1 + Math.random() * 0.2;
      const h = 0.15 + Math.random() * 0.25;

      // Starting position within card bounds
      const startX = (Math.random() - 0.5) * CARD_W * 0.8;
      const startZ = (Math.random() - 0.5) * CARD_H * 0.8;

      return {
        startPos: [startX, 0, startZ] as [number, number, number],
        velocity: [
          Math.cos(angle) * speed,
          2 + Math.random() * 3,
          Math.sin(angle) * speed,
        ] as [number, number, number],
        rotSpeed: [
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ] as [number, number, number],
        size: [w, 0.01, h] as [number, number, number],
      };
    });
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - startTimeRef.current;
    const t = Math.min(elapsed / DURATION, 1);

    // Update each fragment
    groupRef.current.children.forEach((child, i) => {
      const frag = fragments[i];
      if (!frag) return;

      const gravity = -9.8;
      child.position.set(
        frag.startPos[0] + frag.velocity[0] * t,
        frag.startPos[1] + frag.velocity[1] * t + 0.5 * gravity * t * t,
        frag.startPos[2] + frag.velocity[2] * t,
      );

      child.rotation.set(
        frag.rotSpeed[0] * t,
        frag.rotSpeed[1] * t,
        frag.rotSpeed[2] * t,
      );

      // Fade out
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = 1 - t;
    });

    if (t >= 1) {
      onComplete?.();
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {fragments.map((frag, i) => (
        <mesh key={i} position={frag.startPos}>
          <boxGeometry args={frag.size} />
          <meshStandardMaterial
            color={color}
            roughness={0.8}
            transparent
            opacity={1}
          />
        </mesh>
      ))}
    </group>
  );
}

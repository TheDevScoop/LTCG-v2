import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface AttackSlashProps {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  onComplete?: () => void;
}

/**
 * Glowing slash plane that sweeps from attacker to target.
 */
export function AttackSlash({ from, to, color = "#ffcc00", onComplete }: AttackSlashProps) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);

  // Direction vector from attacker to target
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const angle = Math.atan2(dir.x, dir.z);

  useFrame((_, delta) => {
    if (!groupRef.current || completedRef.current) return;

    progressRef.current += delta * 4; // ~0.25 sec
    const t = Math.min(progressRef.current, 1);

    // Lerp position from attacker to target
    groupRef.current.position.set(
      from[0] + dir.x * t,
      from[1] + 0.3 + Math.sin(t * Math.PI) * 0.5,
      from[2] + dir.z * t,
    );

    // Fade out in last 30%
    const meshes = groupRef.current.children;
    for (const child of meshes) {
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = t > 0.7 ? (1 - t) / 0.3 : 1;
      }
    }

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  return (
    <group ref={groupRef} position={[from[0], from[1] + 0.3, from[2]]}>
      <mesh rotation={[0, angle, Math.PI / 4]}>
        <planeGeometry args={[0.6, 0.06]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

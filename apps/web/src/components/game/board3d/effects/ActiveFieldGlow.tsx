import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Glowing plane underneath the player's card zone when it's their turn.
 * Emissive yellow pulse matching the zine reputation color.
 */
export function ActiveFieldGlow() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.08 + Math.sin(clock.elapsedTime * 3) * 0.04;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 0.003, 1.85]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[6, 3.5]} />
      <meshBasicMaterial
        color="#ffcc00"
        transparent
        opacity={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

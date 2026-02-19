import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const LINE_WIDTH = 10;
const LINE_DEPTH = 0.02;

/**
 * Glowing center divider line between player and opponent fields.
 */
export function CenterDivider() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    // Subtle pulse
    mat.emissiveIntensity = 0.3 + Math.sin(clock.elapsedTime * 2) * 0.1;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, 0.005, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[LINE_WIDTH, LINE_DEPTH]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={0.3}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

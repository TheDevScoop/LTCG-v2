import { useRef } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

const BOARD_WIDTH = 12;
const BOARD_HEIGHT = 8;
const BOARD_COLOR = "#2a2520";

export function BoardTable() {
  const meshRef = useRef<THREE.Mesh>(null);

  // Try to load playmat texture, fall back to solid color
  let playmatTexture: THREE.Texture | null = null;
  try {
    playmatTexture = useTexture("/game-assets/board/playmat.png");
  } catch {
    // Texture not found — use solid color fallback
  }

  return (
    <group>
      {/* Main board surface */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
        <meshStandardMaterial
          color={BOARD_COLOR}
          map={playmatTexture}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* Subtle dot grid overlay */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.03}
        />
      </mesh>
    </group>
  );
}

export { BOARD_WIDTH, BOARD_HEIGHT };

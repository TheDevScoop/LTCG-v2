import { useTexture } from "@react-three/drei";
import * as THREE from "three/webgpu";
import { PLAYMAT_PATH } from "@/lib/cardArtMap";

const BOARD_WIDTH = 12;
const BOARD_HEIGHT = 8;

// Preload the chalkboard texture
useTexture.preload(PLAYMAT_PATH);

export function BoardTable() {
  const playmatTexture = useTexture(PLAYMAT_PATH);
  playmatTexture.colorSpace = THREE.SRGBColorSpace;
  // Tile/repeat is not needed — playmat is a single image covering the whole board
  playmatTexture.wrapS = THREE.ClampToEdgeWrapping;
  playmatTexture.wrapT = THREE.ClampToEdgeWrapping;

  return (
    <group>
      {/* Main board surface — chalkboard playmat */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
        <meshStandardMaterial
          map={playmatTexture}
          color="#e8e8e8"
          roughness={0.92}
          metalness={0.0}
        />
      </mesh>

      {/* Subtle dark vignette at edges — slightly darker plane underneath */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
      >
        <planeGeometry args={[BOARD_WIDTH + 0.5, BOARD_HEIGHT + 0.5]} />
        <meshStandardMaterial
          color="#151210"
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}

export { BOARD_WIDTH, BOARD_HEIGHT };

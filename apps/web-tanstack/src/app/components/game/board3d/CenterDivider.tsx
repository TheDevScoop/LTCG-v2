import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { float, sin, time, vec3 } from "three/tsl";

const LINE_WIDTH = 10;
const LINE_DEPTH = 0.02;

/**
 * Glowing center divider line between player and opponent fields.
 * Emissive pulse driven entirely by TSL (GPU-side).
 */
export function CenterDivider() {
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      roughness: 1,
      metalness: 0,
    });
    // Pulse: 0.3 + sin(t * 2) * 0.1, applied to white emissive
    const intensity = sin(time.mul(2)).mul(0.1).add(0.3);
    mat.emissiveNode = vec3(float(1), float(1), float(1)).mul(intensity);
    return mat;
  }, []);

  return (
    <mesh
      position={[0, 0.005, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[LINE_WIDTH, LINE_DEPTH]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { sin, time } from "three/tsl";

/**
 * Glowing plane underneath the player's card zone when it's their turn.
 * Emissive yellow pulse matching the zine reputation color.
 * Opacity pulse driven entirely by TSL (GPU-side).
 */
export function ActiveFieldGlow() {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      color: 0xffcc00,
      transparent: true,
      side: THREE.DoubleSide,
    });
    // Pulse: 0.08 + sin(t * 3) * 0.04
    mat.opacityNode = sin(time.mul(3)).mul(0.04).add(0.08);
    return mat;
  }, []);

  return (
    <mesh
      position={[0, 0.003, 1.85]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[6, 3.5]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

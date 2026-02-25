import { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";

interface CrumpledPaperProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
  /** Random seed for consistent displacement */
  seed?: number;
}

/**
 * Crumpled paper ball — displaced icosahedron.
 * Adds to the school environment. ~80 triangles.
 */
export function CrumpledPaper({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = "#e8e4d8",
  seed = 42,
}: CrumpledPaperProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.08, 1);

    // Pseudo-random based on seed
    const seededRandom = (i: number) => {
      const x = Math.sin(seed * 9301 + i * 4973) * 49297;
      return x - Math.floor(x);
    };

    // Displace vertices for crumpled look
    const posAttr = geo.getAttribute("position");
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      const len = Math.sqrt(x * x + y * y + z * z);
      const displacement = 0.6 + seededRandom(i) * 0.5;

      posAttr.setXYZ(
        i,
        (x / len) * 0.08 * displacement,
        (y / len) * 0.08 * displacement,
        (z / len) * 0.08 * displacement,
      );
    }

    geo.computeVertexNormals();
    return geo;
  }, [seed]);

  useEffect(() => {
    return () => { geometry.dispose(); };
  }, [geometry]);

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.95}
        flatShading
      />
    </mesh>
  );
}

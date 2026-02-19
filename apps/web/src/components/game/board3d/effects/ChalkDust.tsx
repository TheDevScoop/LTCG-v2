import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 60;

/**
 * Chalk dust particles floating upward — replaces CSS particle overlay.
 * Uses Three.js Points geometry for GPU-efficient rendering.
 */
export function ChalkDust() {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Spread across board area
      pos[i3] = (Math.random() - 0.5) * 10;     // x
      pos[i3 + 1] = Math.random() * 3;           // y (height)
      pos[i3 + 2] = (Math.random() - 0.5) * 7;  // z

      // Slow upward drift with slight horizontal wander
      vel[i3] = (Math.random() - 0.5) * 0.002;
      vel[i3 + 1] = 0.003 + Math.random() * 0.005;
      vel[i3 + 2] = (Math.random() - 0.5) * 0.002;
    }

    return { positions: pos, velocities: vel };
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [positions]);

  useFrame(() => {
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      arr[i3]! += velocities[i3]!;
      arr[i3 + 1]! += velocities[i3 + 1]!;
      arr[i3 + 2]! += velocities[i3 + 2]!;

      // Reset particles that float too high
      if (arr[i3 + 1]! > 4) {
        arr[i3] = (Math.random() - 0.5) * 10;
        arr[i3 + 1] = -0.5;
        arr[i3 + 2] = (Math.random() - 0.5) * 7;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#ffffff"
        size={0.03}
        transparent
        opacity={0.3}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

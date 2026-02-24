import { useMemo, useEffect } from "react";
import * as THREE from "three/webgpu";
import {
  float, vec3, fract, hash, vertexIndex, time,
} from "three/tsl";

const PARTICLE_COUNT = 60;

/**
 * Chalk dust particles floating upward — entirely GPU-driven via TSL.
 * No CPU animation loop: positions computed in the vertex shader each frame
 * using `time` (auto-incrementing uniform) and `hash` for per-particle randomness.
 */
export function ChalkDust() {
  const material = useMemo(() => {
    const mat = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      size: 0.03,
    });

    const t = time;
    const i = float(vertexIndex);

    // Deterministic per-particle seed
    const seed = i.mul(0.0137);

    // Initial spread across board area
    const initX = hash(seed).sub(0.5).mul(10);           // -5..5
    const initZ = hash(seed.add(0.3)).sub(0.5).mul(7);   // -3.5..3.5

    // Velocity: upward drift + slight horizontal wander
    const velY = hash(seed.add(0.1)).mul(0.005).add(0.003); // 0.003..0.008
    const velX = hash(seed.add(0.2)).sub(0.5).mul(0.002);
    const velZ = hash(seed.add(0.4)).sub(0.5).mul(0.002);

    // Wrap-around: particle resets when it exceeds y range
    // Cycle covers y from -0.5 to 4.0 (total 4.5 units)
    const cycleTime = float(4.5).div(velY);
    const phase = fract(t.div(cycleTime)); // 0..1 repeating

    const x = initX.add(velX.mul(t));
    const y = float(-0.5).add(phase.mul(4.5)); // -0.5 to 4.0
    const z = initZ.add(velZ.mul(t));

    mat.positionNode = vec3(x, y, z);

    // Fade out as particle rises (higher = more transparent)
    const heightFade = float(1).sub(phase);
    mat.colorNode = vec3(0.9, 0.88, 0.82); // chalk white
    mat.opacityNode = heightFade.mul(0.15);

    return mat;
  }, []);

  // Geometry with PARTICLE_COUNT vertices (positions overridden by positionNode)
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  useEffect(() => {
    return () => { geometry.dispose(); };
  }, [geometry]);

  return (
    <points geometry={geometry}>
      <primitive object={material} attach="material" />
    </points>
  );
}

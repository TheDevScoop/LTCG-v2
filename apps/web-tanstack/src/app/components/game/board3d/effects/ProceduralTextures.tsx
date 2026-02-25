import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { hash, uv, float, vec4, fract, add, time, step } from "three/tsl";

/**
 * GPU-driven noise grain overlay — TSL shader node, no Canvas2D.
 * Animated per-frame via the built-in `time` uniform so each frame
 * shows a different noise pattern (film grain / xerox feel).
 */
export function NoiseOverlay() {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Animated noise: hash a packed seed derived from UV + time.
    // hash() expects a single float Node; we pack x/y/t into one value
    // using large coprime multipliers to avoid repetition.
    const uvCoord = uv();
    const seed = add(
      uvCoord.x.mul(12.9898),
      uvCoord.y.mul(78.233),
      fract(time),
    );
    const noiseVal = hash(seed);

    mat.colorNode = vec4(noiseVal, noiseVal, noiseVal, float(0.06));
    mat.opacityNode = float(0.06);

    return mat;
  }, []);

  return (
    <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 8]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * GPU-driven scanline overlay — TSL shader node, no Canvas2D.
 * Thin horizontal dark bands at regular intervals for a CRT / photocopy feel.
 */
export function ScanlineOverlay() {
  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const uvCoord = uv();

    // Scanlines: step function on fractional y-UV at regular intervals.
    // lineFreq = how many scanlines across the surface.
    // lineThickness = fraction of each cell that is a dark band (0-1).
    const lineFreq = float(128);
    const lineThickness = float(0.3);
    const scanline = fract(uvCoord.y.mul(lineFreq));

    // step(edge, x): returns 0 when x < edge, 1 when x >= edge.
    // We want dark where scanline < lineThickness, so invert:
    // alpha = (1 - step(lineThickness, scanline)) * 0.04
    const lineMask = float(1).sub(step(lineThickness, scanline));
    const lineAlpha = lineMask.mul(float(0.04));

    mat.colorNode = vec4(0, 0, 0, lineAlpha);
    mat.opacityNode = lineAlpha;

    return mat;
  }, []);

  return (
    <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 8]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

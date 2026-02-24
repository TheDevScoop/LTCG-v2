import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";

interface SoloCupProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
  /** Liquid fill level 0..1 */
  fillLevel?: number;
}

/**
 * Low-poly red solo cup — the iconic party cup.
 * Truncated cone with ridged rim. ~400 triangles.
 */
export function SoloCup({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = "#cc2233",
  fillLevel = 0.6,
}: SoloCupProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Cup body: truncated cone (lathe geometry for ridges)
  const cupGeometry = useMemo(() => {
    // Profile points for cup cross-section (right side)
    const points: THREE.Vector2[] = [];

    // Bottom (flat, slight inset)
    const bottomRadius = 0.18;
    const topRadius = 0.32;
    const height = 0.55;
    const rimHeight = 0.03;
    const rimExtra = 0.015;
    const segments = 16;

    // Bottom center to outer bottom
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(bottomRadius, 0));

    // Cup wall (slight curve outward)
    const wallSteps = 8;
    for (let i = 1; i <= wallSteps; i++) {
      const t = i / wallSteps;
      const r = bottomRadius + (topRadius - bottomRadius) * t;
      // Slight belly curve
      const bulge = Math.sin(t * Math.PI) * 0.008;
      points.push(new THREE.Vector2(r + bulge, t * height));
    }

    // Rim (rolled lip)
    points.push(new THREE.Vector2(topRadius + rimExtra, height));
    points.push(new THREE.Vector2(topRadius + rimExtra, height + rimHeight));
    points.push(new THREE.Vector2(topRadius - 0.005, height + rimHeight));

    return new THREE.LatheGeometry(points, segments);
  }, []);

  useEffect(() => {
    return () => { cupGeometry.dispose(); };
  }, [cupGeometry]);

  // Liquid surface
  const liquidGeometry = useMemo(() => {
    if (fillLevel <= 0) return null;
    const bottomRadius = 0.18;
    const topRadius = 0.32;
    const liquidR = bottomRadius + (topRadius - bottomRadius) * fillLevel * 0.9;
    return new THREE.CircleGeometry(liquidR - 0.01, 16);
  }, [fillLevel]);

  useEffect(() => {
    return () => { liquidGeometry?.dispose(); };
  }, [liquidGeometry]);

  // Subtle idle wobble
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 0.3) * 0.01;
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
      {/* Cup body */}
      <mesh geometry={cupGeometry}>
        <meshStandardMaterial
          color={color}
          roughness={0.6}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Interior darkening */}
      <mesh position={[0, 0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.31, 16]} />
        <meshStandardMaterial color="#1a0a0a" roughness={0.9} />
      </mesh>

      {/* Liquid surface */}
      {liquidGeometry && (
        <mesh
          geometry={liquidGeometry}
          position={[0, fillLevel * 0.55 * 0.9, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            color="#d4a500"
            roughness={0.2}
            metalness={0.1}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}
    </group>
  );
}

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const SLOT_W = 0.7;
const SLOT_H = 1.0;
const BRACKET_SIZE = 0.08;
const BRACKET_THICKNESS = 0.01;

interface EmptySlot3DProps {
  position: [number, number, number];
  label?: string;
}

/**
 * Empty board slot — faint rectangle outline with corner brackets.
 */
export function EmptySlot3D({ position }: EmptySlot3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    // Subtle breathing opacity
    const mat = groupRef.current.children[0]
      ?.children[0] as THREE.Mesh | undefined;
    if (mat?.material && "opacity" in mat.material) {
      (mat.material as THREE.MeshBasicMaterial).opacity =
        0.15 + Math.sin(clock.elapsedTime * 1.5) * 0.05;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Slot outline — 4 corner brackets */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        {/* Top-left corner */}
        <CornerBracket
          x={-SLOT_W / 2}
          y={SLOT_H / 2}
          rotZ={0}
        />
        {/* Top-right corner */}
        <CornerBracket
          x={SLOT_W / 2}
          y={SLOT_H / 2}
          rotZ={-Math.PI / 2}
        />
        {/* Bottom-left corner */}
        <CornerBracket
          x={-SLOT_W / 2}
          y={-SLOT_H / 2}
          rotZ={Math.PI / 2}
        />
        {/* Bottom-right corner */}
        <CornerBracket
          x={SLOT_W / 2}
          y={-SLOT_H / 2}
          rotZ={Math.PI}
        />
      </group>
    </group>
  );
}

function CornerBracket({
  x,
  y,
  rotZ,
}: {
  x: number;
  y: number;
  rotZ: number;
}) {
  return (
    <group position={[x, y, 0]} rotation={[0, 0, rotZ]}>
      {/* Horizontal arm */}
      <mesh position={[BRACKET_SIZE / 2, 0, 0]}>
        <planeGeometry args={[BRACKET_SIZE, BRACKET_THICKNESS]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Vertical arm */}
      <mesh position={[0, -BRACKET_SIZE / 2, 0]}>
        <planeGeometry args={[BRACKET_THICKNESS, BRACKET_SIZE]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

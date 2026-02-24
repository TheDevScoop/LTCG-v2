import { useMemo } from "react";
import * as THREE from "three/webgpu";
import { sin, time } from "three/tsl";

const SLOT_W = 0.7;
const SLOT_H = 1.0;
const BRACKET_SIZE = 0.08;
const BRACKET_THICKNESS = 0.01;

interface EmptySlot3DProps {
  position: [number, number, number];
  label?: string;
}

/**
 * Shared breathing-opacity material for all corner bracket meshes.
 * TSL drives the pulse entirely on the GPU.
 */
function useBracketMaterial() {
  return useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
    });
    // Breathing: 0.15 + sin(t * 1.5) * 0.05
    mat.opacityNode = sin(time.mul(1.5)).mul(0.05).add(0.15);
    return mat;
  }, []);
}

/**
 * Empty board slot — faint rectangle outline with corner brackets.
 */
export function EmptySlot3D({ position }: EmptySlot3DProps) {
  const bracketMat = useBracketMaterial();

  return (
    <group position={position}>
      {/* Slot outline — 4 corner brackets */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        {/* Top-left corner */}
        <CornerBracket
          x={-SLOT_W / 2}
          y={SLOT_H / 2}
          rotZ={0}
          material={bracketMat}
        />
        {/* Top-right corner */}
        <CornerBracket
          x={SLOT_W / 2}
          y={SLOT_H / 2}
          rotZ={-Math.PI / 2}
          material={bracketMat}
        />
        {/* Bottom-left corner */}
        <CornerBracket
          x={-SLOT_W / 2}
          y={-SLOT_H / 2}
          rotZ={Math.PI / 2}
          material={bracketMat}
        />
        {/* Bottom-right corner */}
        <CornerBracket
          x={SLOT_W / 2}
          y={-SLOT_H / 2}
          rotZ={Math.PI}
          material={bracketMat}
        />
      </group>
    </group>
  );
}

function CornerBracket({
  x,
  y,
  rotZ,
  material,
}: {
  x: number;
  y: number;
  rotZ: number;
  material: THREE.MeshBasicNodeMaterial;
}) {
  return (
    <group position={[x, y, 0]} rotation={[0, 0, rotZ]}>
      {/* Horizontal arm */}
      <mesh position={[BRACKET_SIZE / 2, 0, 0]}>
        <planeGeometry args={[BRACKET_SIZE, BRACKET_THICKNESS]} />
        <primitive object={material} attach="material" />
      </mesh>
      {/* Vertical arm */}
      <mesh position={[0, -BRACKET_SIZE / 2, 0]}>
        <planeGeometry args={[BRACKET_THICKNESS, BRACKET_SIZE]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}

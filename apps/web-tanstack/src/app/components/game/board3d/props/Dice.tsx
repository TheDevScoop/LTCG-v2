import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three/webgpu";

interface DiceProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
  dotColor?: string;
  /** Animate idle spin */
  animate?: boolean;
}

const DOT_RADIUS = 0.04;
const DOT_INSET = 0.001; // How far dots sit from face
const HALF = 0.12; // Half the cube size

/** Dot positions for each face of a d6 (centered on face) */
const FACE_DOTS: Array<{
  faceNormal: [number, number, number];
  faceRotation: [number, number, number];
  dots: Array<[number, number]>;
}> = [
  // 1 — front (+Z)
  {
    faceNormal: [0, 0, 1],
    faceRotation: [0, 0, 0],
    dots: [[0, 0]],
  },
  // 6 — back (-Z)
  {
    faceNormal: [0, 0, -1],
    faceRotation: [0, Math.PI, 0],
    dots: [
      [-0.055, 0.055], [0, 0.055], [0.055, 0.055],
      [-0.055, -0.055], [0, -0.055], [0.055, -0.055],
    ],
  },
  // 2 — right (+X)
  {
    faceNormal: [1, 0, 0],
    faceRotation: [0, Math.PI / 2, 0],
    dots: [[-0.05, 0.05], [0.05, -0.05]],
  },
  // 5 — left (-X)
  {
    faceNormal: [-1, 0, 0],
    faceRotation: [0, -Math.PI / 2, 0],
    dots: [
      [-0.055, 0.055], [0.055, 0.055],
      [0, 0],
      [-0.055, -0.055], [0.055, -0.055],
    ],
  },
  // 3 — top (+Y)
  {
    faceNormal: [0, 1, 0],
    faceRotation: [-Math.PI / 2, 0, 0],
    dots: [[-0.055, 0.055], [0, 0], [0.055, -0.055]],
  },
  // 4 — bottom (-Y)
  {
    faceNormal: [0, -1, 0],
    faceRotation: [Math.PI / 2, 0, 0],
    dots: [
      [-0.055, 0.055], [0.055, 0.055],
      [-0.055, -0.055], [0.055, -0.055],
    ],
  },
];

/**
 * Low-poly d6 with pip dots.
 * Chunky, scratched-up aesthetic. ~300 triangles.
 */
export function Dice({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = "#f5f0e8",
  dotColor = "#121212",
  animate = true,
}: DiceProps) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current || !animate) return;
    const t = clock.elapsedTime;
    ref.current.rotation.y = Math.sin(t * 0.15) * 0.1 + rotation[1];
    ref.current.rotation.x = Math.cos(t * 0.12) * 0.05 + rotation[0];
  });

  return (
    <group
      ref={ref}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
    >
      {/* Cube body — slightly rounded look via bevel (just a box) */}
      <mesh>
        <boxGeometry args={[HALF * 2, HALF * 2, HALF * 2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.75}
          metalness={0.02}
        />
      </mesh>

      {/* Dots on each face */}
      {FACE_DOTS.map((face, fi) =>
        face.dots.map((dot, di) => (
          <mesh
            key={`${fi}-${di}`}
            position={[
              face.faceNormal[0] * (HALF + DOT_INSET) + (face.faceNormal[0] === 0 ? (face.faceNormal[2] !== 0 ? dot[0] : 0) : 0) + (face.faceNormal[1] !== 0 ? dot[0] : 0),
              face.faceNormal[1] * (HALF + DOT_INSET) + (face.faceNormal[1] === 0 ? (face.faceNormal[2] !== 0 ? dot[1] : dot[1]) : 0),
              face.faceNormal[2] * (HALF + DOT_INSET) + (face.faceNormal[2] !== 0 ? 0 : (face.faceNormal[0] !== 0 ? dot[1] : dot[0])),
            ]}
            rotation={face.faceRotation}
          >
            <circleGeometry args={[DOT_RADIUS, 8]} />
            <meshStandardMaterial color={dotColor} roughness={0.9} />
          </mesh>
        ))
      )}
    </group>
  );
}

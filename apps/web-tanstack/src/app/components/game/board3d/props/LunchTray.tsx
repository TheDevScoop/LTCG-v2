import { useMemo } from "react";

interface LunchTrayProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
}

/**
 * School lunch tray — flat rectangular tray with raised edges and compartments.
 * Sits under/beside the board for environment dressing. ~200 triangles.
 */
export function LunchTray({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = "#b8a88a",
}: LunchTrayProps) {
  const trayW = 1.6;
  const trayD = 1.0;
  const trayH = 0.03;
  const rimH = 0.04;
  const rimW = 0.025;

  // Compartment divider positions
  const dividers = useMemo(() => [
    // Horizontal divider (1/3 from top)
    { pos: [0, rimH / 2, -trayD * 0.17] as [number, number, number], size: [trayW - rimW * 4, rimH * 0.7, 0.01] as [number, number, number] },
    // Vertical divider (left section)
    { pos: [-trayW * 0.15, rimH / 2, trayD * 0.17] as [number, number, number], size: [0.01, rimH * 0.7, trayD * 0.5] as [number, number, number] },
  ], [trayW, trayD, rimH, rimW]);

  return (
    <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
      {/* Tray base */}
      <mesh position={[0, trayH / 2, 0]}>
        <boxGeometry args={[trayW, trayH, trayD]} />
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>

      {/* Raised rim — 4 sides */}
      {/* Front */}
      <mesh position={[0, trayH + rimH / 2, trayD / 2 - rimW / 2]}>
        <boxGeometry args={[trayW, rimH, rimW]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Back */}
      <mesh position={[0, trayH + rimH / 2, -trayD / 2 + rimW / 2]}>
        <boxGeometry args={[trayW, rimH, rimW]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Left */}
      <mesh position={[-trayW / 2 + rimW / 2, trayH + rimH / 2, 0]}>
        <boxGeometry args={[rimW, rimH, trayD]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Right */}
      <mesh position={[trayW / 2 - rimW / 2, trayH + rimH / 2, 0]}>
        <boxGeometry args={[rimW, rimH, trayD]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>

      {/* Compartment dividers */}
      {dividers.map((d, i) => (
        <mesh key={i} position={d.pos}>
          <boxGeometry args={d.size} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

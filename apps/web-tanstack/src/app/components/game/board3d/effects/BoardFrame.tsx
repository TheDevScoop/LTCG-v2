const BOARD_W = 12;
const BOARD_H = 8;
const FRAME_THICKNESS = 0.3;
const FRAME_HEIGHT = 0.15;
const FRAME_COLOR = "#1a1714";

/**
 * Decorative 3D frame around the board — like Artifact's wooden border.
 * Simple box geometries with dark ink/wood texture, zine aesthetic.
 */
export function BoardFrame() {
  const halfW = BOARD_W / 2;
  const halfH = BOARD_H / 2;
  const y = FRAME_HEIGHT / 2;

  return (
    <group>
      {/* Top edge */}
      <mesh position={[0, y, -halfH - FRAME_THICKNESS / 2]} castShadow>
        <boxGeometry args={[BOARD_W + FRAME_THICKNESS * 2, FRAME_HEIGHT, FRAME_THICKNESS]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Bottom edge */}
      <mesh position={[0, y, halfH + FRAME_THICKNESS / 2]} castShadow>
        <boxGeometry args={[BOARD_W + FRAME_THICKNESS * 2, FRAME_HEIGHT, FRAME_THICKNESS]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Left edge */}
      <mesh position={[-halfW - FRAME_THICKNESS / 2, y, 0]} castShadow>
        <boxGeometry args={[FRAME_THICKNESS, FRAME_HEIGHT, BOARD_H]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Right edge */}
      <mesh position={[halfW + FRAME_THICKNESS / 2, y, 0]} castShadow>
        <boxGeometry args={[FRAME_THICKNESS, FRAME_HEIGHT, BOARD_H]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Corner accents — chunky geometric blocks (zine, not steampunk) */}
      <CornerBlock x={-halfW} z={-halfH} />
      <CornerBlock x={halfW} z={-halfH} />
      <CornerBlock x={-halfW} z={halfH} />
      <CornerBlock x={halfW} z={halfH} />
    </group>
  );
}

function CornerBlock({ x, z }: { x: number; z: number }) {
  return (
    <mesh
      position={[x, FRAME_HEIGHT / 2 + 0.05, z]}
      castShadow
    >
      <boxGeometry args={[0.4, FRAME_HEIGHT + 0.1, 0.4]} />
      <meshStandardMaterial color="#121212" roughness={0.85} metalness={0.1} />
    </mesh>
  );
}

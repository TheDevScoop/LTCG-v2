
interface PencilProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** Pencil body color */
  color?: string;
}

/**
 * Low-poly pencil lying on the board.
 * Hexagonal body + cone tip + eraser. ~150 triangles.
 * Adds to the "school lunch table" aesthetic.
 */
export function Pencil({
  position = [0, 0, 0],
  rotation = [0, 0, Math.PI / 2],
  scale = 1,
  color = "#e8c840",
}: PencilProps) {
  const bodyLength = 0.8;
  const bodyRadius = 0.02;
  const tipLength = 0.06;
  const eraserLength = 0.04;
  const segments = 6; // Hexagonal!

  return (
    <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
      {/* Pencil body — hexagonal cylinder */}
      <mesh position={[0, bodyLength / 2, 0]}>
        <cylinderGeometry args={[bodyRadius, bodyRadius, bodyLength, segments]} />
        <meshStandardMaterial color={color} roughness={0.7} flatShading />
      </mesh>

      {/* Exposed wood near tip */}
      <mesh position={[0, tipLength / 2 - 0.01, 0]}>
        <cylinderGeometry args={[bodyRadius * 0.5, bodyRadius, tipLength * 1.5, segments]} />
        <meshStandardMaterial color="#d4a86a" roughness={0.8} flatShading />
      </mesh>

      {/* Graphite tip — cone */}
      <mesh position={[0, -tipLength / 2, 0]}>
        <coneGeometry args={[bodyRadius * 0.5, tipLength, segments]} />
        <meshStandardMaterial color="#333333" roughness={0.5} />
      </mesh>

      {/* Metal ferrule (eraser band) */}
      <mesh position={[0, bodyLength + eraserLength * 0.3, 0]}>
        <cylinderGeometry args={[bodyRadius * 1.05, bodyRadius * 1.05, eraserLength * 0.6, segments]} />
        <meshStandardMaterial color="#b8b8b8" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Eraser */}
      <mesh position={[0, bodyLength + eraserLength, 0]}>
        <cylinderGeometry args={[bodyRadius * 0.95, bodyRadius * 0.95, eraserLength, segments]} />
        <meshStandardMaterial color="#d4627a" roughness={0.85} />
      </mesh>
    </group>
  );
}

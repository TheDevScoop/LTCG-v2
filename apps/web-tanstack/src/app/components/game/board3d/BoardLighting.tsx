import type { Phase } from "../types";

interface BoardLightingProps {
  phase?: Phase;
}

/**
 * Lighting rig for the 3D board:
 * - Directional light from above-left casting card shadows
 * - Ambient fill to prevent pure black shadows
 * - Rim light for card edge definition
 * - Phase-dependent color tinting
 */
export function BoardLighting({ phase }: BoardLightingProps) {
  const isCombat = phase === "combat";
  const mainColor = isCombat ? "#ffe0d0" : "#ffffff";
  const ambientIntensity = isCombat ? 0.6 : 0.7;

  return (
    <>
      {/* Main directional light — casts shadows */}
      <directionalLight
        position={[-4, 10, 4]}
        intensity={1.2}
        color={mainColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.001}
      />

      {/* Ambient fill */}
      <ambientLight intensity={ambientIntensity} color="#e8e4df" />

      {/* Rim/back light for card edge definition */}
      <directionalLight
        position={[3, 6, -6]}
        intensity={0.3}
        color="#d0d8e8"
      />
    </>
  );
}

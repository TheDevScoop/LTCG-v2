import { useRef, useState, useMemo, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// Card dimensions in 3D world units (aspect ratio ~3:4)
const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.02;
const HOVER_LIFT = 0.15;
const HOVER_SCALE = 1.05;

interface Card3DProps {
  cardId: string;
  definitionId: string;
  cardDef?: {
    name?: string;
    type?: string;
    attack?: number;
    defense?: number;
    archetype?: string;
  };
  position: [number, number, number];
  faceDown?: boolean;
  cardPosition?: "attack" | "defense";
  highlight?: boolean;
  viceCounters?: number;
  temporaryBoosts?: { attack?: number; defense?: number };
  onClick?: (cardId: string) => void;
  interactive?: boolean;
  disabled?: boolean;
}

// Archetype to hex color mapping for card face tinting
const ARCHETYPE_COLORS: Record<string, string> = {
  dropout: "#dc2626",
  prep: "#2563eb",
  geek: "#eab308",
  freak: "#9333ea",
  nerd: "#16a34a",
  goodie_two_shoes: "#9ca3af",
};

function getArchetypeColor(archetype?: string): string {
  if (!archetype) return "#666666";
  const key = archetype.toLowerCase().replace(/\s+/g, "_");
  return ARCHETYPE_COLORS[key] ?? "#666666";
}

export function Card3D({
  cardId,
  cardDef,
  position,
  faceDown = false,
  cardPosition = "attack",
  highlight = false,
  viceCounters = 0,
  temporaryBoosts,
  onClick,
  interactive = true,
  disabled = false,
}: Card3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const isClickable = interactive && !disabled && !!onClick;

  // Defense position = rotated 90 degrees on board
  const isDefense = cardPosition === "defense" && !faceDown;

  // Archetype color for card face gradient
  const archetypeColor = useMemo(
    () => getArchetypeColor(cardDef?.archetype),
    [cardDef?.archetype],
  );

  // Card face material colors
  const faceMaterial = useMemo(() => {
    if (faceDown) return { color: "#121212", emissive: "#000000" };
    return { color: archetypeColor, emissive: "#000000" };
  }, [faceDown, archetypeColor]);

  // Hover animation
  useFrame(() => {
    if (!groupRef.current) return;
    const target = hovered && isClickable ? HOVER_LIFT : 0;
    const targetScale = hovered && isClickable ? HOVER_SCALE : 1;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      position[1] + CARD_D / 2 + target,
      0.15,
    );
    groupRef.current.scale.x = THREE.MathUtils.lerp(
      groupRef.current.scale.x,
      targetScale,
      0.15,
    );
    groupRef.current.scale.y = THREE.MathUtils.lerp(
      groupRef.current.scale.y,
      targetScale,
      0.15,
    );
    groupRef.current.scale.z = THREE.MathUtils.lerp(
      groupRef.current.scale.z,
      targetScale,
      0.15,
    );
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (isClickable) onClick!(cardId);
    },
    [isClickable, onClick, cardId],
  );

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (isClickable) {
        setHovered(true);
        document.body.style.cursor = "pointer";
      }
    },
    [isClickable],
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = "auto";
  }, []);

  // Stats for display
  const isMonster = cardDef?.type === "stereotype";
  const atk = (cardDef?.attack ?? 0) + (temporaryBoosts?.attack ?? 0);
  const def = (cardDef?.defense ?? 0) + (temporaryBoosts?.defense ?? 0);

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + CARD_D / 2, position[2]]}
      rotation={[0, isDefense ? Math.PI / 2 : 0, 0]}
    >
      {/* Card body - thin box */}
      <mesh
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[CARD_W, CARD_D, CARD_H]} />
        <meshStandardMaterial
          color={faceMaterial.color}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>

      {/* Card face (top surface) */}
      <mesh position={[0, CARD_D / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD_W * 0.95, CARD_H * 0.95]} />
        <meshStandardMaterial
          color={faceDown ? "#1a1a1a" : "#fdfdfb"}
          roughness={0.7}
          metalness={0.0}
        />
      </mesh>

      {/* Highlight ring */}
      {highlight && (
        <mesh
          position={[0, -CARD_D / 2 + 0.001, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.45, 0.52, 4]} />
          <meshBasicMaterial
            color="#ffcc00"
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Card info overlay via HTML */}
      {!faceDown && (
        <Html
          position={[0, CARD_D / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          transform
          occlude={false}
          style={{
            width: "56px",
            height: "80px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "80px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "2px",
              fontFamily: "Outfit, sans-serif",
              color: "#121212",
              overflow: "hidden",
            }}
          >
            {/* Card name */}
            <div
              style={{
                fontSize: "6px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {cardDef?.name ?? "Unknown"}
            </div>

            {/* Vice counter badge */}
            {viceCounters > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  backgroundColor: "#dc2626",
                  color: "white",
                  fontSize: "6px",
                  fontWeight: 900,
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {viceCounters}
              </div>
            )}

            {/* ATK/DEF stats */}
            {isMonster && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "6px",
                  fontWeight: 700,
                }}
              >
                <span style={{ color: "#ffcc00" }}>ATK {atk}</span>
                <span style={{ color: "#33ccff" }}>DEF {def}</span>
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Face-down "?" glyph */}
      {faceDown && (
        <Html
          position={[0, CARD_D / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          transform
          occlude={false}
          style={{
            width: "56px",
            height: "80px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "80px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Special Elite, cursive",
              fontSize: "24px",
              color: "#fdfdfb",
            }}
          >
            ?
          </div>
        </Html>
      )}
    </group>
  );
}

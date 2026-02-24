import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTexture, Html } from "@react-three/drei";
import * as THREE from "three/webgpu";
import { float, mix, sin, time, uniform } from "three/tsl";
import { getCardArt, getCardFrame, CARD_BACK_PATH } from "@/lib/cardArtMap";

// Card dimensions in 3D world units (aspect ratio ~3:4)
const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.02;
const HOVER_LIFT = 0.2;
const HOVER_SCALE = 1.08;

interface Card3DProps {
  cardId: string;
  definitionId: string;
  cardDef?: {
    name?: string;
    type?: string;
    cardType?: string;
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

// Archetype to hex color mapping for card body edge tinting
const ARCHETYPE_COLORS: Record<string, string> = {
  dropout: "#dc2626",
  prep: "#2563eb",
  geek: "#eab308",
  freak: "#9333ea",
  nerd: "#16a34a",
  goodie_two_shoes: "#9ca3af",
};

function getArchetypeColor(archetype?: string): string {
  if (!archetype) return "#333333";
  const key = archetype.toLowerCase().replace(/\s+/g, "_");
  return ARCHETYPE_COLORS[key] ?? "#333333";
}

/**
 * Preload card-back texture so it's shared across all face-down cards.
 */
useTexture.preload(CARD_BACK_PATH);

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

  // Resolve texture paths
  const cardType = cardDef?.type ?? cardDef?.cardType;
  const artPath = getCardArt(cardDef?.name);
  const framePath = getCardFrame(cardType);
  const archetypeColor = useMemo(
    () => getArchetypeColor(cardDef?.archetype),
    [cardDef?.archetype],
  );

  // Hover animation with smooth lerp
  useFrame(() => {
    if (!groupRef.current) return;
    const targetY = position[1] + CARD_D / 2 + (hovered && isClickable ? HOVER_LIFT : 0);
    const targetScale = hovered && isClickable ? HOVER_SCALE : 1;
    const lerpSpeed = 0.12;

    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y, targetY, lerpSpeed,
    );
    const s = THREE.MathUtils.lerp(groupRef.current.scale.x, targetScale, lerpSpeed);
    groupRef.current.scale.set(s, s, s);
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

  // Reset cursor on unmount so it doesn't stay as "pointer" after the card leaves the DOM
  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  // Stats
  const isMonster = cardType === "stereotype" || cardType === "monster";
  const boostAtk = temporaryBoosts?.attack ?? 0;
  const boostDef = temporaryBoosts?.defense ?? 0;
  const atk = (cardDef?.attack ?? 0) + boostAtk;
  const def = (cardDef?.defense ?? 0) + boostDef;
  const atkColor = boostAtk > 0 ? "#22c55e" : boostAtk < 0 ? "#ef4444" : "#ffcc00";
  const defColor = boostDef > 0 ? "#22c55e" : boostDef < 0 ? "#ef4444" : "#33ccff";

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + CARD_D / 2, position[2]]}
      rotation={[0, isDefense ? Math.PI / 2 : 0, 0]}
    >
      {/* Card body — thin box with archetype-colored edges */}
      <mesh
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[CARD_W, CARD_D, CARD_H]} />
        <meshStandardMaterial
          color={faceDown ? "#121212" : archetypeColor}
          roughness={0.7}
          metalness={0.05}
        />
      </mesh>

      {/* Top face — card art or card back */}
      {faceDown ? (
        <CardBackFace />
      ) : (
        <CardFrontFace
          artPath={artPath}
          framePath={framePath}
          archetypeColor={archetypeColor}
        />
      )}

      {/* Bottom face — always card back */}
      <mesh position={[0, -CARD_D / 2 - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[CARD_W * 0.96, CARD_H * 0.96]} />
        <meshStandardMaterial color="#121212" roughness={0.8} />
      </mesh>

      {/* Highlight glow ring (under card, visible on board) */}
      {highlight && <HighlightRing hovered={hovered} />}

      {/* Stats overlay — crisp HTML on top of card */}
      {!faceDown && (
        <Html
          position={[0, CARD_D / 2 + 0.015, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          transform
          occlude={false}
          style={{
            width: "70px",
            height: "100px",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: "70px",
              height: "100px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "3px 4px",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            {/* Card name — top */}
            <div
              style={{
                fontSize: "7px",
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: "#fdfdfb",
                textShadow: "0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.5)",
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
                  top: "1px",
                  right: "2px",
                  backgroundColor: "#dc2626",
                  color: "white",
                  fontSize: "7px",
                  fontWeight: 900,
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.6)",
                }}
              >
                {viceCounters}
              </div>
            )}

            {/* ATK/DEF stats — bottom */}
            {isMonster && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "7px",
                  fontWeight: 800,
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                }}
              >
                <span style={{ color: atkColor }}>ATK {atk}</span>
                <span style={{ color: defColor }}>DEF {def}</span>
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Card back texture on the visible face when face-down — uses meshBasicMaterial for full-brightness */
function CardBackFace() {
  const texture = useTexture(CARD_BACK_PATH);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh position={[0, CARD_D / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD_W * 0.96, CARD_H * 0.96]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

/** Card front — art image (if exists) + frame overlay */
function CardFrontFace({
  artPath,
  framePath,
  archetypeColor,
}: {
  artPath?: string;
  framePath?: string;
  archetypeColor: string;
}) {
  return (
    <group>
      {/* Base layer — archetype gradient color or card art */}
      {artPath ? (
        <CardArtPlane path={artPath} />
      ) : (
        <mesh position={[0, CARD_D / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CARD_W * 0.96, CARD_H * 0.96]} />
          <meshBasicMaterial color={archetypeColor} />
        </mesh>
      )}

      {/* Frame overlay on top of art */}
      {framePath && <CardFramePlane path={framePath} />}
    </group>
  );
}

/** Loads and displays a card art image — uses meshBasicMaterial for full-brightness rendering */
function CardArtPlane({ path }: { path: string }) {
  const texture = useTexture(path);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh position={[0, CARD_D / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD_W * 0.96, CARD_H * 0.96]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

/** Loads and displays a card frame PNG overlay (transparent) — uses meshBasicMaterial for full-brightness */
function CardFramePlane({ path }: { path: string }) {
  const texture = useTexture(path);
  texture.colorSpace = THREE.SRGBColorSpace;

  return (
    <mesh position={[0, CARD_D / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CARD_W * 0.96, CARD_H * 0.96]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.05}
      />
    </mesh>
  );
}

/** Pulsing highlight ring under actionable cards.
 *  Opacity pulse driven entirely by TSL (GPU-side).
 *  When hovered, opacity snaps to 1 via a uniform toggle.
 */
function HighlightRing({ hovered }: { hovered: boolean }) {
  const hoveredUniform = useMemo(() => uniform(0), []);

  // Sync React prop into TSL uniform
  useEffect(() => {
    hoveredUniform.value = hovered ? 1 : 0;
  }, [hovered, hoveredUniform]);

  const material = useMemo(() => {
    const mat = new THREE.MeshBasicNodeMaterial({
      color: 0xffcc00,
      transparent: true,
      side: THREE.DoubleSide,
    });
    // Pulse: 0.6 + sin(t * 4) * 0.3; when hovered, snap to 1.0
    const pulse = sin(time.mul(4)).mul(0.3).add(0.6);
    mat.opacityNode = mix(pulse, float(1), hoveredUniform);
    return mat;
  }, [hoveredUniform]);

  return (
    <mesh
      position={[0, -CARD_D / 2 + 0.002, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[0.42, 0.55, 4]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export { CARD_W, CARD_H, CARD_D };

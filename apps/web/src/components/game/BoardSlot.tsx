import { motion } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";
import { getCardArt } from "@/lib/cardArtMap";
import { FRAME_MONSTER, FRAME_SPELL, FRAME_TRAP, FRAME_ENVIRONMENT, CARD_BACK } from "@/lib/blobUrls";
import { useCardTilt } from "@/hooks/useCardTilt";
import type { BoardCard } from "./types";

// Generated frame image paths
const FRAME_IMAGES: Record<string, string> = {
  stereotype: FRAME_MONSTER,
  spell: FRAME_SPELL,
  trap: FRAME_TRAP,
  environment: FRAME_ENVIRONMENT,
  vice: FRAME_MONSTER, // fallback to monster
};
const CARD_BACK_IMG = CARD_BACK;

const ARCHETYPE_HEX: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#a855f7",
  green: "#22c55e",
  gray: "#9ca3af",
};

const ARCHETYPE_HEX_DARK: Record<string, string> = {
  red: "#7f1d1d",
  blue: "#1e3a5f",
  yellow: "#713f12",
  purple: "#4a044e",
  green: "#14532d",
  gray: "#1f2937",
};

const CARD_TYPE_LABEL: Record<string, string> = {
  stereotype: "STEREOTYPE",
  spell: "SPELL",
  trap: "TRAP",
  vice: "VICE",
  environment: "ENV",
};

function getGlowColor(archetype?: string): string {
  const theme = getArchetypeTheme(archetype);
  return ARCHETYPE_HEX[theme.color] ?? "#a855f7";
}

function getGlowColorDark(archetype?: string): string {
  const theme = getArchetypeTheme(archetype);
  return ARCHETYPE_HEX_DARK[theme.color] ?? "#4a044e";
}

export const summonVariants = {
  initial: {
    opacity: 0,
    scale: 0.3,
    rotateX: -35,
    y: -20,
  },
  animate: {
    opacity: 1,
    scale: [0.3, 1.15, 0.95, 1],
    rotateX: [-35, 8, -2, 0],
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 18,
      mass: 0.8,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.3,
    rotateZ: 25,
    filter: "brightness(3) saturate(0)",
    y: 20,
    transition: { duration: 0.35, ease: "easeIn" as const },
  },
};

/** Responsive card width — scales from 80px to 140px based on viewport */
const CARD_WIDTH_STYLE = { width: "clamp(80px, 12vw, 140px)" };

interface BoardSlotProps {
  card?: BoardCard;
  cardDef?: any;
  highlight?: boolean;
  onClick?: () => void;
  variant?: "monster" | "spellTrap";
}

export function BoardSlot({ card, cardDef, highlight, onClick, variant = "monster" }: BoardSlotProps) {
  const isClickable = !!onClick;
  const isSpellTrap = variant === "spellTrap";
  const { tiltStyle, onMouseMove, onMouseLeave } = useCardTilt({ maxTilt: 4 });

  // Empty slot — scratched zone outline, punk feel
  if (!card) {
    return (
      <motion.div
        className={`board-slot-empty aspect-[3/4] flex items-center justify-center relative ${
          isClickable ? "cursor-pointer" : ""
        }`}
        style={{
          ...CARD_WIDTH_STYLE,
          transformStyle: "preserve-3d",
          border: "1px dashed rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.015)",
        }}
        whileHover={
          isClickable
            ? {
                scale: 1.05,
                rotateX: -5,
                rotateY: 2,
                boxShadow: "0 0 18px rgba(255,255,255,0.06), inset 0 0 12px rgba(255,255,255,0.03)",
              }
            : {}
        }
        whileTap={isClickable ? { scale: 0.95 } : {}}
        onClick={onClick}
      >
        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/8" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/8" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/8" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/8" />
        <span className="text-white/8 font-['Special_Elite']" style={{ fontSize: "clamp(14px, 2.5vw, 20px)" }}>
          {isSpellTrap ? "S/T" : "+"}
        </span>
      </motion.div>
    );
  }

  const glowHex = getGlowColor(cardDef?.archetype);
  const glowDark = getGlowColorDark(cardDef?.archetype);
  const artSrc = getCardArt(cardDef?.name);

  // Face-down card — uses generated card-back.png
  if (card.faceDown) {
    return (
      <motion.div
        className={`board-card-slot aspect-[3/4] relative overflow-hidden ${
          highlight ? "board-card-highlight" : ""
        } ${isClickable ? "cursor-pointer" : ""}`}
        style={{
          ...CARD_WIDTH_STYLE,
          transformStyle: "preserve-3d",
          boxShadow: "4px 4px 0px 0px rgba(18,18,18,0.8)",
        }}
        variants={summonVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        whileHover={
          isClickable
            ? {
                scale: 1.08,
                rotateX: -6,
                rotateY: 3,
                y: -4,
                boxShadow: "6px 8px 0px 0px rgba(18,18,18,0.6), 0 0 20px rgba(255,255,255,0.1)",
              }
            : {}
        }
        whileTap={isClickable ? { scale: 0.95 } : {}}
        onClick={onClick}
      >
        {/* Card back image */}
        <img
          src={CARD_BACK_IMG}
          alt="Card back"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {highlight && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-10"
            animate={{ opacity: [0.3, 0.85, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              border: "2px solid rgba(255,255,255,0.6)",
              boxShadow: "inset 0 0 12px rgba(255,255,255,0.15), 0 0 16px rgba(255,255,255,0.1)",
            }}
          />
        )}
      </motion.div>
    );
  }

  // Face-up card — generated frame image overlay + card data
  const cardType = cardDef?.cardType ?? cardDef?.type ?? "";
  const isMonster = cardType === "stereotype";
  const positionLabel = card.position === "attack" ? "ATK" : "DEF";
  const typeLabel = CARD_TYPE_LABEL[cardType] ?? "CARD";
  const frameImg = FRAME_IMAGES[cardType] ?? FRAME_IMAGES["stereotype"];

  const baseAtk = cardDef?.attack ?? 0;
  const baseDef = cardDef?.defense ?? 0;
  const boostAtk = card.temporaryBoosts?.attack ?? 0;
  const boostDef = card.temporaryBoosts?.defense ?? 0;
  const totalAtk = baseAtk + boostAtk;
  const totalDef = baseDef + boostDef;
  const atkBoosted = boostAtk !== 0;
  const defBoosted = boostDef !== 0;

  return (
    <motion.div
      className={`board-card-slot aspect-[3/4] relative overflow-hidden ${
        isClickable ? "cursor-pointer" : ""
      }`}
      style={{
        ...CARD_WIDTH_STYLE,
        transformStyle: "preserve-3d",
        boxShadow: `4px 4px 0px 0px rgba(18,18,18,0.8)${highlight ? `, 0 0 16px ${glowHex}50` : ""}`,
        background: "#0d0c0a",
        ["--tilt-x" as string]: `${tiltStyle.rotateX}deg`,
        ["--tilt-y" as string]: `${tiltStyle.rotateY}deg`,
      }}
      variants={summonVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      whileHover={
        isClickable
          ? {
              scale: 1.12,
              y: -6,
              boxShadow: `6px 8px 0px 0px rgba(18,18,18,0.5), 0 0 24px ${glowHex}40, 0 0 48px ${glowHex}15`,
            }
          : {}
      }
      whileTap={isClickable ? { scale: 0.95 } : {}}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Summon shockwave ring */}
      <motion.div
        className="absolute inset-0 pointer-events-none z-30"
        initial={{ scale: 0.5, opacity: 0.8 }}
        animate={{ scale: 2.5, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        style={{
          borderRadius: "50%",
          border: `2px solid ${glowHex}`,
          left: "50%",
          top: "50%",
          width: "100%",
          height: "100%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Background: art or archetype gradient */}
      <div className="absolute inset-0 flex flex-col">
        {/* Art area — fills the top portion */}
        <div className="flex-1 relative overflow-hidden">
          {artSrc ? (
            <img
              src={artSrc}
              alt={cardDef?.name ?? "Card art"}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(ellipse 70% 65% at 50% 45%, ${glowHex}aa 0%, ${glowHex}44 35%, ${glowDark}cc 65%, #080706 100%)`,
                }}
              />
              {/* Halftone dot overlay */}
              <div
                className="absolute inset-0 opacity-[0.1]"
                style={{
                  backgroundImage: "radial-gradient(circle, #000 0.7px, transparent 0.7px)",
                  backgroundSize: "4px 4px",
                }}
              />
              {/* Archetype initial watermark — shimmer */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  className="font-['Outfit'] font-black leading-none select-none pointer-events-none uppercase"
                  style={{
                    fontSize: "clamp(28px, 6vw, 48px)",
                    color: "rgba(255,255,255,0.08)",
                    textShadow: `2px 2px 0px rgba(0,0,0,0.3), 0 0 20px ${glowHex}40`,
                  }}
                  animate={{ opacity: [0.06, 0.12, 0.06] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  {cardDef?.archetype?.charAt(0).toUpperCase() ?? "?"}
                </motion.span>
              </div>
            </>
          )}
        </div>
        {/* Dark bottom area for name/stats */}
        <div className="h-[40%] bg-[#0d0c0a]" />
      </div>

      {/* Generated frame overlay — covers the entire card */}
      <img
        src={frameImg}
        alt={`${typeLabel} frame`}
        className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
        draggable={false}
      />

      {/* Card data overlaid on top of the frame */}
      <div className="absolute inset-0 flex flex-col z-20 pointer-events-none">
        {/* Position badge — top left */}
        <div className="relative">
          {isMonster && (
            <div
              className="absolute top-1.5 left-1.5 font-black uppercase px-1 py-px leading-none pointer-events-auto"
              style={{
                fontSize: "clamp(7px, 1.2vw, 10px)",
                backgroundColor: card.position === "attack" ? "#e8e4df" : "#33ccff",
                color: "#0a0a0a",
                boxShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              }}
            >
              {positionLabel}
            </div>
          )}

          {/* Vice counter badge — top right */}
          {(card.viceCounters ?? 0) > 0 && (
            <motion.div
              className="absolute top-1.5 right-1.5 bg-red-600 text-white font-black flex items-center justify-center pointer-events-auto"
              style={{
                fontSize: "clamp(7px, 1.2vw, 10px)",
                width: "clamp(14px, 2.5vw, 20px)",
                height: "clamp(14px, 2.5vw, 20px)",
                boxShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              {card.viceCounters ?? 0}
            </motion.div>
          )}
        </div>

        {/* Spacer for art area */}
        <div className="flex-1" />

        {/* Name text — positioned over the frame's name banner area */}
        <div
          className="w-full flex items-center justify-center px-1.5"
          style={{
            height: "13%",
            background: "rgba(0,0,0,0.65)",
          }}
        >
          <span
            className="font-['Outfit'] font-black leading-tight truncate text-white uppercase text-center"
            style={{
              fontSize: "clamp(9px, 1.5vw, 13px)",
              letterSpacing: "0.04em",
              textShadow: "1px 1px 0 rgba(0,0,0,0.9)",
            }}
          >
            {cardDef?.name ?? "???"}
          </span>
        </div>

        {/* Type badge */}
        <div className="flex justify-center pb-0.5">
          <span
            className="font-['Outfit'] font-black uppercase px-1 leading-none"
            style={{
              fontSize: "clamp(6px, 1vw, 9px)",
              color: glowHex,
              letterSpacing: "0.06em",
              textShadow: "1px 1px 0 rgba(0,0,0,0.8)",
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Stats area — bottom of card over the frame's stat boxes */}
        {isMonster && (
          <div className="flex justify-center gap-2 pb-2.5 px-2">
            <div
              className="flex flex-col items-center px-1.5 py-0.5"
              style={{
                background: "rgba(0,0,0,0.7)",
                border: `1px solid ${atkBoosted ? (boostAtk > 0 ? "#22c55e60" : "#ef444460") : "rgba(255,255,255,0.2)"}`,
                boxShadow: "1px 1px 0 rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="font-['Outfit'] font-black leading-none"
                style={{
                  fontSize: "clamp(12px, 2vw, 16px)",
                  color: atkBoosted
                    ? boostAtk > 0
                      ? "#22c55e"
                      : "#ef4444"
                    : "#e8e4df",
                  textShadow: "1px 1px 0 rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)",
                }}
              >
                {totalAtk}
              </span>
              <span className="font-bold text-white/40 leading-none" style={{ fontSize: "clamp(5px, 0.8vw, 7px)" }}>ATK</span>
            </div>
            <div
              className="flex flex-col items-center px-1.5 py-0.5"
              style={{
                background: "rgba(0,0,0,0.7)",
                border: `1px solid ${defBoosted ? (boostDef > 0 ? "#22c55e60" : "#ef444460") : "#33ccff40"}`,
                boxShadow: "1px 1px 0 rgba(0,0,0,0.5)",
              }}
            >
              <span
                className="font-['Outfit'] font-black leading-none"
                style={{
                  fontSize: "clamp(12px, 2vw, 16px)",
                  color: defBoosted
                    ? boostDef > 0
                      ? "#22c55e"
                      : "#ef4444"
                    : "#33ccff",
                  textShadow: "1px 1px 0 rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.5)",
                }}
              >
                {totalDef}
              </span>
              <span className="font-bold text-white/40 leading-none" style={{ fontSize: "clamp(5px, 0.8vw, 7px)" }}>DEF</span>
            </div>
          </div>
        )}
        {!isMonster && <div className="h-3" />}
      </div>

      {/* Highlight pulse */}
      {highlight && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-30"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            boxShadow: `inset 0 0 8px ${glowHex}30, 0 0 14px ${glowHex}30`,
            border: `2px solid ${glowHex}`,
          }}
        />
      )}
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";
import { getCardArt } from "@/lib/cardArtMap";
import { useCardTilt } from "@/hooks/useCardTilt";

const ARCHETYPE_HEX: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#a855f7",
  green: "#22c55e",
  gray: "#9ca3af",
};

// Per-archetype art gradients for the card art area (no-art fallback)
const ARCHETYPE_ART_GRADIENT: Record<string, string> = {
  red: "radial-gradient(ellipse at 50% 40%, #4a0e0e 0%, #2d0808 40%, #1a0604 70%, #0d0604 100%)",
  blue: "radial-gradient(ellipse at 60% 40%, #1b3a6b 0%, #132952 40%, #0f1a2e 70%, #0a0d14 100%)",
  yellow: "radial-gradient(ellipse at 50% 40%, #5c4a00 0%, #3d3000 40%, #1c1800 70%, #0f0e07 100%)",
  purple: "radial-gradient(ellipse at 40% 50%, #5b1a80 0%, #3b1060 40%, #1a0d24 70%, #0d0714 100%)",
  green: "radial-gradient(ellipse at 50% 40%, #1a5c2a 0%, #0d3e18 40%, #0a1a0c 70%, #050f07 100%)",
  gray: "radial-gradient(ellipse at 50% 40%, #3a3a44 0%, #252530 40%, #16161a 70%, #0d0d10 100%)",
};

interface HandCardProps {
  cardId: string;
  cardDef?: any;
  index: number;
  totalCards: number;
  playable?: boolean;
  onClick?: () => void;
}

export function HandCard({
  cardId: _cardId,
  cardDef,
  index,
  totalCards,
  playable,
  onClick,
}: HandCardProps) {
  const center = (totalCards - 1) / 2;
  const offset = index - center;
  const rotate = offset * 3;
  const translateY = Math.abs(offset) * 10;
  const translateZ = (1 - Math.abs(offset) / Math.max(center, 1)) * 18;

  const archetypeTheme = getArchetypeTheme(cardDef?.archetype);
  const archetypeColor = ARCHETYPE_HEX[archetypeTheme.color] || "#121212";
  const artGradient =
    ARCHETYPE_ART_GRADIENT[archetypeTheme.color] ||
    ARCHETYPE_ART_GRADIENT["gray"];

  const cardType = cardDef?.cardType ?? cardDef?.type ?? "";
  const isMonster = cardType === "stereotype";
  const isClickable = !!onClick;
  const artSrc = getCardArt(cardDef?.name);

  // Build dynamic shadow based on playability
  const baseShadow = "4px 4px 0px 0px rgba(18,18,18,0.8)";
  const playableGlow = playable
    ? `, 0 0 14px ${archetypeColor}60, 0 0 28px ${archetypeColor}30`
    : "";
  const cardShadow = baseShadow + playableGlow;

  // Type label text
  const TYPE_LABELS: Record<string, string> = {
    stereotype: "STEREOTYPE",
    spell: "SPELL",
    trap: "TRAP",
    vice: "VICE",
    environment: "ENV",
  };
  const typeLabel = TYPE_LABELS[cardType] ?? (cardType.toUpperCase() || "???");

  // Short effect for non-monster cards
  const shortEffect =
    cardDef?.shortEffect ||
    cardDef?.effect?.slice(0, 40) ||
    cardDef?.effects?.[0]?.description?.slice(0, 40) ||
    cardDef?.flavorText?.slice(0, 40) ||
    (cardType === "spell" ? "Activate for an effect." : "Trigger when conditions are met.");

  const { tiltStyle, onMouseMove, onMouseLeave } = useCardTilt({ maxTilt: 8 });

  return (
    <motion.div
      className={`hand-card flex flex-col overflow-hidden relative ${
        isClickable ? "cursor-pointer" : ""
      }`}
      style={{
        width: "clamp(72px, 10vw, 110px)",
        aspectRatio: "5 / 7",
        rotate: `${rotate}deg`,
        y: translateY,
        z: translateZ,
        transformStyle: "preserve-3d",
        background: "#1e1c1a",
        boxShadow: cardShadow,
        border: `2px solid ${playable ? archetypeColor : "#2a2520"}`,
      }}
      whileHover={
        isClickable
          ? {
              y: -32,
              scale: 1.15,
              zIndex: 10,
              rotate: 0,
              z: 24,
              boxShadow: `6px 8px 0px 0px rgba(18,18,18,0.5), 0 0 30px ${archetypeColor}50, 0 16px 40px rgba(0,0,0,0.25)`,
            }
          : {}
      }
      animate={{
        rotate: `${rotate}deg`,
        y: translateY,
        rotateX: tiltStyle.rotateX,
        rotateY: tiltStyle.rotateY,
      }}
      whileTap={isClickable ? { scale: 0.95 } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Playable pulse border */}
      {playable && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-20"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            border: `2px solid ${archetypeColor}`,
            boxShadow: `inset 0 0 8px ${archetypeColor}30`,
          }}
        />
      )}

      {/* Top archetype color band */}
      <div className="w-full flex-shrink-0" style={{ height: "clamp(8px, 1.5vw, 12px)", backgroundColor: archetypeColor }} />

      {/* Card art area (~45% of card body) */}
      <div
        className="w-full flex-shrink-0 relative overflow-hidden"
        style={{
          height: "42%",
          backgroundImage: artSrc ? undefined : artGradient,
        }}
      >
        {artSrc ? (
          <img
            src={artSrc}
            alt={cardDef?.name ?? "Card art"}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            {/* Subtle inner frame on art area */}
            <div
              className="absolute inset-[2px] pointer-events-none"
              style={{
                border: `1px solid ${archetypeColor}25`,
              }}
            />
          </>
        )}
        {/* Archetype color shimmer at art bottom edge */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${archetypeColor}50 50%, transparent 100%)`,
          }}
        />
      </div>

      {/* Name banner */}
      <div
        className="w-full flex-shrink-0 flex items-center justify-center px-1"
        style={{
          backgroundColor: "#0d0b09",
          minHeight: "clamp(14px, 2.5vw, 20px)",
          borderTop: `1px solid ${archetypeColor}30`,
          borderBottom: `1px solid ${archetypeColor}20`,
        }}
      >
        <span
          className="font-['Outfit'] font-black text-center leading-tight line-clamp-1 text-white/90 uppercase"
          style={{ fontSize: "clamp(7.5px, 1.3vw, 11px)", letterSpacing: "0.04em" }}
        >
          {cardDef?.name || "Unknown"}
        </span>
      </div>

      {/* Type label */}
      <div
        className="w-full text-center font-bold uppercase px-1"
        style={{ fontSize: "clamp(6px, 1vw, 8px)", color: archetypeColor, paddingTop: "2px", paddingBottom: "1px" }}
      >
        {typeLabel}
      </div>

      {/* Stats or effect section */}
      <div className="flex-1 flex items-end pb-1 px-1">
        {isMonster ? (
          /* Monster stats: ATK / DEF boxes */
          <div className="w-full flex gap-[3px]">
            <div
              className="flex-1 flex flex-col items-center justify-center"
              style={{
                backgroundColor: "#0d0b09",
                border: `1px solid rgba(255,255,255,0.2)`,
                paddingTop: "2px",
                paddingBottom: "2px",
                boxShadow: "1px 1px 0 rgba(0,0,0,0.3)",
              }}
            >
              <span style={{ fontSize: "clamp(5px, 0.8vw, 7px)", color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
                ATK
              </span>
              <span
                className="font-black font-['Outfit']"
                style={{ fontSize: "clamp(8px, 1.5vw, 12px)", color: "#e8e4df", lineHeight: 1, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}
              >
                {cardDef?.attack ?? 0}
              </span>
            </div>
            <div
              className="flex-1 flex flex-col items-center justify-center"
              style={{
                backgroundColor: "#0d0b09",
                border: `1px solid #33ccff40`,
                paddingTop: "2px",
                paddingBottom: "2px",
                boxShadow: "1px 1px 0 rgba(0,0,0,0.3)",
              }}
            >
              <span style={{ fontSize: "clamp(5px, 0.8vw, 7px)", color: "#33ccff80", letterSpacing: "0.05em" }}>
                DEF
              </span>
              <span
                className="font-black font-['Outfit']"
                style={{ fontSize: "clamp(8px, 1.5vw, 12px)", color: "#33ccff", lineHeight: 1, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}
              >
                {cardDef?.defense ?? 0}
              </span>
            </div>
          </div>
        ) : (
          /* Spell / Trap effect preview */
          <p
            className="w-full text-center leading-tight line-clamp-2"
            style={{ fontSize: "clamp(6px, 1vw, 8px)", color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}
          >
            {shortEffect}
          </p>
        )}
      </div>

      {/* Bottom archetype stripe */}
      <div
        className="w-full flex-shrink-0"
        style={{ height: "clamp(3px, 0.5vw, 5px)", backgroundColor: archetypeColor, opacity: 0.7 }}
      />

      {/* Foil holographic glow — follows tilt */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-0 hover:opacity-100 transition-opacity duration-200"
        style={{
          background: `radial-gradient(circle at ${50 + tiltStyle.rotateY * 3}% ${50 - tiltStyle.rotateX * 3}%, ${archetypeColor}30 0%, transparent 60%)`,
          mixBlendMode: "screen",
        }}
      />

      {/* Halftone dot overlay — zine texture */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 0.4px, transparent 0.4px)",
          backgroundSize: "4px 4px",
        }}
      />
    </motion.div>
  );
}

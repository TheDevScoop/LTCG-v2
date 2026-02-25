import { motion, AnimatePresence } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface CardDetailOverlayProps {
  cardDef: any;
  location: "hand" | "backrow" | "board";
  phase?: string;
  isMyTurn?: boolean;
  onSummon?: (position: "attack" | "defense") => void;
  onSetMonster?: () => void;
  onSetSpellTrap?: () => void;
  onActivateSpell?: () => void;
  onActivateEffect?: (effectIndex: number) => void;
  activatableEffects?: number[];
  onChangePosition?: () => void;
  canChangePosition?: boolean;
  onClose: () => void;
}

const colorMap: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  yellow: "#eab308",
  purple: "#a855f7",
  green: "#22c55e",
  gray: "#9ca3af",
};

function formatAbility(ability: any): string {
  if (!ability) return "";
  const trigger = ability.trigger ?? "";
  const ops = Array.isArray(ability.operations)
    ? ability.operations.join(", ")
    : "";
  const targets = Array.isArray(ability.targets)
    ? ability.targets.join(", ")
    : "";

  const triggerLabel = trigger
    .replace(/^On/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();

  const parts: string[] = [];
  if (triggerLabel) parts.push(triggerLabel + ":");
  if (ops) parts.push(ops);
  if (targets && targets !== "self") parts.push(`(${targets})`);
  return parts.join(" ");
}

function getTypeLabel(cardDef: any): string {
  const type = cardDef?.type ?? cardDef?.cardType;
  if (type === "stereotype") return "Stereotype";
  if (type === "spell") {
    const sub = cardDef?.spellType;
    return sub ? `Spell - ${sub.charAt(0).toUpperCase() + sub.slice(1)}` : "Spell";
  }
  if (type === "trap") {
    const sub = cardDef?.trapType;
    return sub ? `Trap - ${sub.charAt(0).toUpperCase() + sub.slice(1)}` : "Trap";
  }
  return "Card";
}

function getTypeIcon(cardDef: any): string {
  const type = cardDef?.type ?? cardDef?.cardType;
  if (type === "stereotype") return "⚔️";
  if (type === "spell") return "🪄";
  if (type === "trap") return "🪤";
  return "🎴";
}

export function CardDetailOverlay({
  cardDef,
  location,
  phase,
  isMyTurn,
  onSummon,
  onSetMonster,
  onSetSpellTrap,
  onActivateSpell,
  onActivateEffect,
  activatableEffects,
  onChangePosition,
  canChangePosition,
  onClose,
}: CardDetailOverlayProps) {
  const type = cardDef?.type ?? cardDef?.cardType;
  const isMonster = type === "stereotype";
  const isSpell = type === "spell";
  const isTrap = type === "trap";
  const isMainPhase = phase === "main" || phase === "main2";
  const canAct = isMyTurn !== false && isMainPhase;

  const archetypeTheme = getArchetypeTheme(cardDef?.archetype);
  const accentColor = colorMap[archetypeTheme.color] || "#121212";
  const abilities = Array.isArray(cardDef?.ability) ? cardDef.ability : [];
  // Engine uses effects[] array for activation; fall back to ability[] for display
  const effects = Array.isArray(cardDef?.effects) ? cardDef.effects : abilities;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop — radial spotlight */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="absolute inset-0 backdrop-blur-sm"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.4), rgba(0,0,0,0.85))",
          }}
        />

        {/* Card + Actions */}
        <motion.div
          initial={{ scale: 0.3, opacity: 0, rotateY: 0 }}
          animate={{ scale: 1, opacity: 1, rotateY: 360 }}
          exit={{ scale: 0.5, opacity: 0, y: 60 }}
          transition={{
            scale: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
            rotateY: { duration: 0.35, ease: "easeOut" },
            opacity: { duration: 0.2 },
          }}
          className="relative z-10 flex flex-col items-center gap-4 max-w-[320px] w-full px-4"
          style={{ perspective: 800 }}
        >
          {/* Enlarged Card */}
          <div
            className="w-[240px] border-[3px] border-[#121212] bg-[#fdfdfb] flex flex-col overflow-hidden"
            style={{ boxShadow: `0 0 40px ${accentColor}40, 0 0 80px ${accentColor}20, 6px 6px 0px 0px ${accentColor}40, 8px 8px 0px 0px rgba(18,18,18,0.3)` }}
          >
            {/* Archetype color header */}
            <div className="h-2 w-full" style={{ backgroundColor: accentColor }} />

            {/* Card header */}
            <div className="px-3 pt-2 pb-1 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="font-['Outfit'] font-black text-base uppercase tracking-tighter leading-tight text-[#121212]">
                  {cardDef?.name || "Unknown Card"}
                </h2>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs">{getTypeIcon(cardDef)}</span>
                  <span className="font-['Outfit'] text-[10px] font-bold uppercase tracking-wide" style={{ color: accentColor }}>
                    {getTypeLabel(cardDef)}
                  </span>
                </div>
              </div>
              {cardDef?.level != null && (
                <div
                  className="flex items-center justify-center w-8 h-8 border-2 border-[#121212] font-['Outfit'] font-black text-sm"
                  style={{ backgroundColor: accentColor + "30" }}
                >
                  {cardDef.level}
                </div>
              )}
            </div>

            <div className="mx-3 border-t-2 border-[#121212]/20" />

            {/* Card body */}
            <div className="px-3 py-2 flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {cardDef?.archetype && (
                  <span className="font-['Outfit'] text-[10px] font-bold uppercase px-1.5 py-0.5 border border-current" style={{ color: accentColor }}>
                    {archetypeTheme.icon} {cardDef.archetype}
                  </span>
                )}
                {cardDef?.attribute && (
                  <span className="font-['Outfit'] text-[10px] font-bold uppercase text-[#666] px-1.5 py-0.5 border border-[#666]/30">
                    {cardDef.attribute}
                  </span>
                )}
                {cardDef?.rarity && (
                  <span className="font-['Special_Elite'] text-[10px] italic text-[#999]">
                    {cardDef.rarity}
                  </span>
                )}
              </div>

              {isMonster && (
                <div className="flex gap-4">
                  <div className="flex items-center gap-1">
                    <span className="font-['Outfit'] text-xs font-black text-[#ffcc00]">ATK</span>
                    <span className="font-['Outfit'] text-lg font-black text-[#ffcc00]">{cardDef?.attack ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-['Outfit'] text-xs font-black text-[#33ccff]">DEF</span>
                    <span className="font-['Outfit'] text-lg font-black text-[#33ccff]">{cardDef?.defense ?? 0}</span>
                  </div>
                </div>
              )}

              {/* Card flavor text */}
              {cardDef?.flavorText && (
                <p className="font-['Special_Elite'] text-[11px] leading-snug text-[#555] italic">
                  {cardDef.flavorText}
                </p>
              )}

              {(effects.length > 0 || abilities.length > 0) && (
                <div className="space-y-1.5">
                  <div className="font-['Outfit'] text-[9px] font-bold uppercase tracking-widest text-[#999]">Effects</div>
                  {effects.length > 0
                    ? effects.map((eff: any, i: number) => (
                        <div
                          key={i}
                          className="font-['Special_Elite'] text-[11px] leading-snug text-[#333] bg-[#121212]/5 px-2 py-1.5 border-l-2"
                          style={{ borderColor: accentColor }}
                        >
                          {eff.description || formatAbility(abilities[i]) || "Activatable effect"}
                        </div>
                      ))
                    : abilities.map((ability: any, i: number) => (
                        <div
                          key={i}
                          className="font-['Special_Elite'] text-[11px] leading-snug text-[#333] bg-[#121212]/5 px-2 py-1.5 border-l-2"
                          style={{ borderColor: accentColor }}
                        >
                          {formatAbility(ability)}
                        </div>
                      ))}
                </div>
              )}
            </div>

            <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />
          </div>

          {/* Action Buttons — shown by card type, backend validates */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.25, staggerChildren: 0.12 }}
            className="w-full space-y-2"
          >
            {!canAct && location === "hand" && (
              <p className="font-['Special_Elite'] text-[11px] text-center text-[#999] italic">
                {!isMyTurn ? "Wait for your turn" : `Need main phase to play cards`}
              </p>
            )}

            {location === "hand" && isMonster && (
              <>
                <button onClick={() => onSummon?.("attack")} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                  SUMMON ATTACK
                </button>
                <button onClick={() => onSummon?.("defense")} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                  SUMMON DEFENSE
                </button>
                <button onClick={() => onSetMonster?.()} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                  SET FACE-DOWN
                </button>
              </>
            )}

            {location === "hand" && isSpell && (
              <>
                <button onClick={() => onActivateSpell?.()} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                  ACTIVATE
                </button>
                <button onClick={() => onSetSpellTrap?.()} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                  SET FACE-DOWN
                </button>
              </>
            )}

            {location === "hand" && isTrap && (
              <button onClick={() => onSetSpellTrap?.()} disabled={!canAct} className={`w-full tcg-button text-sm ${!canAct ? "opacity-40 cursor-not-allowed" : ""}`}>
                SET FACE-DOWN
              </button>
            )}

            {location === "board" && isMonster && (
              <>
                {!canAct && (
                  <p className="font-['Special_Elite'] text-[11px] text-center text-[#999] italic">
                    {!isMyTurn ? "Wait for your turn" : "Need main phase to act"}
                  </p>
                )}
                {onActivateEffect && effects.length > 0 && effects.map((_eff: any, i: number) => {
                  const isActivatable = activatableEffects ? activatableEffects.includes(i) : canAct;
                  return (
                    <button
                      key={i}
                      onClick={() => onActivateEffect(i)}
                      disabled={!isActivatable}
                      className={`w-full tcg-button text-sm ${!isActivatable ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      ACTIVATE EFFECT{effects.length > 1 ? ` ${i + 1}` : ""}
                    </button>
                  );
                })}
                {onChangePosition && (
                  <button
                    onClick={() => onChangePosition()}
                    disabled={!canAct || !canChangePosition}
                    className={`w-full tcg-button text-sm ${!canAct || !canChangePosition ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    CHANGE POSITION
                  </button>
                )}
              </>
            )}

            <button onClick={onClose} className="w-full tcg-button-primary text-sm">
              {location === "board" ? "BACK TO FIELD" : "BACK TO HAND"}
            </button>
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

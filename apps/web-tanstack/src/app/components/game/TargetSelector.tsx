import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

export interface TargetCandidate {
  cardId: string;
  definitionId: string;
  faceDown?: boolean;
  position?: "attack" | "defense";
  owner: "player" | "opponent";
  zone: "board" | "spellTrap" | "hand" | "graveyard";
}

interface TargetSelectorProps {
  /** Brief description of the effect being activated. */
  effectDescription?: string;
  /** All valid target candidates the player can pick from. */
  targets: TargetCandidate[];
  /** Card definition lookup for names / archetypes. */
  cardLookup: Record<string, any>;
  /** How many targets must be selected (defaults to 1). */
  targetCount?: number;
  /** Called with the list of selected target cardIds. */
  onConfirm: (targetIds: string[]) => void;
  /** Called when the player cancels the selection. */
  onCancel: () => void;
}

export function TargetSelector({
  effectDescription,
  targets,
  cardLookup,
  targetCount = 1,
  onConfirm,
  onCancel,
}: TargetSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback(
    (cardId: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else if (next.size < targetCount) {
          next.add(cardId);
        }
        return next;
      });
    },
    [targetCount],
  );

  const handleConfirm = useCallback(() => {
    if (selected.size === targetCount) {
      onConfirm(Array.from(selected));
    }
  }, [selected, targetCount, onConfirm]);

  const canConfirm = selected.size === targetCount;

  // Group targets by owner for display
  const opponentTargets = targets.filter((t) => t.owner === "opponent");
  const playerTargets = targets.filter((t) => t.owner === "player");

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="absolute inset-0 bg-black/70"
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative bg-black border-2 border-[#121212] max-w-lg w-full max-h-[85vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2
                className="font-black text-2xl uppercase tracking-tighter text-white"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                SELECT TARGET{targetCount > 1 ? "S" : ""}
              </h2>
              {effectDescription && (
                <p
                  className="text-xs text-[#ffcc00] italic"
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  {effectDescription}
                </p>
              )}
              <p
                className="text-[10px] text-white/40 uppercase tracking-wider font-bold"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Selected: {selected.size} / {targetCount}
              </p>
            </div>

            {/* No targets */}
            {targets.length === 0 && (
              <div className="text-center py-8">
                <p
                  className="font-bold text-white/30 text-sm"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  No valid targets
                </p>
              </div>
            )}

            {/* Opponent targets */}
            {opponentTargets.length > 0 && (
              <TargetGroup
                label="Opponent's Field"
                targets={opponentTargets}
                cardLookup={cardLookup}
                selected={selected}
                onToggle={toggleSelection}
              />
            )}

            {/* Player targets */}
            {playerTargets.length > 0 && (
              <TargetGroup
                label="Your Field"
                targets={playerTargets}
                cardLookup={cardLookup}
                selected={selected}
                onToggle={toggleSelection}
              />
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`flex-1 font-black uppercase tracking-wider text-sm py-3 border-2 transition-colors ${
                  canConfirm
                    ? "bg-[#ffcc00] border-[#ffcc00] text-[#121212] hover:bg-[#ffd633]"
                    : "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
                }`}
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                CONFIRM
              </button>
              <button
                onClick={onCancel}
                className="flex-1 bg-white/10 border-2 border-white/20 text-white font-black uppercase tracking-wider text-sm py-3 hover:bg-white/20 transition-colors"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function TargetGroup({
  label,
  targets,
  cardLookup,
  selected,
  onToggle,
}: {
  label: string;
  targets: TargetCandidate[];
  cardLookup: Record<string, any>;
  selected: Set<string>;
  onToggle: (cardId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p
        className="text-[9px] uppercase tracking-widest text-white/40 font-bold"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        {label}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {targets.map((target) => {
          const def = cardLookup[target.definitionId];
          const isSelected = selected.has(target.cardId);
          const theme = getArchetypeTheme(def?.archetype);

          return (
            <button
              key={target.cardId}
              onClick={() => onToggle(target.cardId)}
              className={`relative p-3 transition-all border-2 text-left hover:scale-[1.02] active:scale-[0.98] ${
                isSelected
                  ? "border-[#ffcc00] bg-[#ffcc00]/10 shadow-[0_0_16px_rgba(255,204,0,0.3)]"
                  : "border-white/15 bg-white/5 hover:border-white/30"
              }`}
            >
              {/* Face-down card */}
              {target.faceDown ? (
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-gradient-to-r from-gray-600 to-gray-400" />
                  <p
                    className="font-black text-xs uppercase tracking-tighter text-white/60"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    FACE-DOWN
                  </p>
                  <p className="text-[10px] text-white/30">
                    {target.zone === "board"
                      ? target.position === "attack"
                        ? "ATK Position"
                        : "DEF Position"
                      : "Set Card"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Archetype stripe */}
                  <div
                    className={`h-1.5 w-full bg-gradient-to-r ${theme.gradient}`}
                  />

                  {/* Card name */}
                  <p
                    className="font-black text-xs uppercase tracking-tighter text-white"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {def?.name || "Unknown"}
                  </p>

                  {/* Stats (if monster) */}
                  {(def?.attack != null || def?.defense != null) && (
                    <div className="flex gap-3 text-[10px] font-mono">
                      {def?.attack != null && (
                        <span className="text-[#ffcc00]">
                          ATK {def.attack}
                        </span>
                      )}
                      {def?.defense != null && (
                        <span className="text-[#33ccff]">
                          DEF {def.defense}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Zone indicator */}
                  <p className="text-[9px] text-white/25 uppercase">
                    {target.zone === "board" && target.position
                      ? `${target.position} pos`
                      : target.zone}
                  </p>
                </div>
              )}

              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[#ffcc00] border-2 border-[#121212] flex items-center justify-center"
                >
                  <span className="font-black text-[10px] text-[#121212]">OK</span>
                </motion.div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

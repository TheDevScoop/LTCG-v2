import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface TributeSelectorProps {
  board: Array<{ cardId: string; definitionId: string; faceDown: boolean }>;
  cardLookup: Record<string, any>;
  requiredCount: number;
  onConfirm: (tributeCardIds: string[]) => void;
  onCancel: () => void;
}

export function TributeSelector({
  board,
  cardLookup,
  requiredCount,
  onConfirm,
  onCancel,
}: TributeSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter to face-up monsters only
  const availableTributes = board.filter((card) => !card.faceDown);

  const toggleSelection = (cardId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      newSelected.add(cardId);
    }
    setSelected(newSelected);
  };

  const handleConfirm = () => {
    if (selected.size === requiredCount) {
      onConfirm(Array.from(selected));
    }
  };

  const canConfirm = selected.size === requiredCount;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="absolute inset-0 bg-black/60"
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative paper-panel max-w-2xl w-full max-h-[80vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <h2 className="font-outfit font-black text-3xl uppercase tracking-tighter">
                SELECT TRIBUTES
              </h2>
              <p className="font-outfit font-bold text-lg">
                Choose {requiredCount} monster{requiredCount > 1 ? "s" : ""} to
                tribute
              </p>
              <p className="text-sm text-foreground/60">
                Selected: {selected.size} / {requiredCount}
              </p>
            </div>

            {/* Available Tributes */}
            {availableTributes.length === 0 ? (
              <div className="text-center py-12">
                <p className="font-outfit font-bold text-lg text-foreground/40">
                  No monsters available to tribute
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {availableTributes.map((boardCard) => {
                  const def = cardLookup[boardCard.definitionId];
                  const isSelected = selected.has(boardCard.cardId);
                  const theme = getArchetypeTheme(def?.archetype);

                  return (
                    <button
                      key={boardCard.cardId}
                      onClick={() => toggleSelection(boardCard.cardId)}
                      className={`
                        relative paper-panel-flat p-3 transition-all
                        hover:scale-105 active:scale-95
                        ${
                          isSelected
                            ? "border-[#ffcc00] border-4 shadow-[0_0_20px_rgba(255,204,0,0.5)]"
                            : ""
                        }
                      `}
                    >
                      {/* Archetype Color Stripe */}
                      <div
                        className={`h-2 w-full mb-2 bg-gradient-to-r ${theme.gradient}`}
                      />

                      {/* Card Name */}
                      <h3 className="font-outfit font-black text-sm uppercase tracking-tighter mb-2">
                        {def?.name || "Unknown"}
                      </h3>

                      {/* Stats */}
                      {def && (
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-red-600">
                            ATK {def.attack ?? "?"}
                          </span>
                          <span className="text-blue-600">
                            DEF {def.defense ?? "?"}
                          </span>
                        </div>
                      )}

                      {/* Selected Indicator */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 w-8 h-8 bg-[#ffcc00] border-2 border-[#121212] rounded-full flex items-center justify-center font-black text-[#121212]"
                        >
                          ✓
                        </motion.div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={!canConfirm}
                className={`
                  flex-1 tcg-button-primary text-sm
                  ${!canConfirm ? "opacity-40 cursor-not-allowed" : ""}
                `}
              >
                CONFIRM
              </button>
              <button onClick={onCancel} className="flex-1 tcg-button text-sm">
                CANCEL
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

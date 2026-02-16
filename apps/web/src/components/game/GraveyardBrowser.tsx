import { motion, AnimatePresence } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface GraveyardBrowserProps {
  title: string;
  cardIds: string[];
  cardLookup: Record<string, any>;
  onClose: () => void;
}

export function GraveyardBrowser({
  title,
  cardIds,
  cardLookup,
  onClose,
}: GraveyardBrowserProps) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70"
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative paper-panel max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b-2 border-[#121212]">
            <h2 className="font-outfit font-black text-3xl uppercase tracking-tighter">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="tcg-button w-12 h-12 flex items-center justify-center text-2xl p-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Card Count */}
          <div className="px-6 py-3 bg-[#121212] text-white">
            <p className="font-outfit font-bold text-sm uppercase tracking-wide">
              {cardIds.length} Card{cardIds.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Card List */}
          <div className="flex-1 overflow-y-auto tcg-scrollbar p-6">
            {cardIds.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="font-outfit font-bold text-2xl uppercase tracking-tighter text-foreground/30">
                  Empty
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cardIds.map((cardId, index) => {
                  const def = cardLookup[cardId];
                  const theme = getArchetypeTheme(def?.archetype);

                  const cardType =
                    def?.type || def?.cardType || "unknown";
                  const isMonster =
                    cardType === "stereotype" || cardType === "monster";
                  const isSpell = cardType === "spell";
                  const isTrap = cardType === "trap";

                  return (
                    <motion.div
                      key={`${cardId}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="paper-panel-flat p-4 space-y-3 hover:scale-105 transition-transform"
                    >
                      {/* Archetype Color Stripe */}
                      <div
                        className={`h-2 w-full bg-gradient-to-r ${
                          theme.gradient
                        } ${!isMonster ? "opacity-40" : ""}`}
                      />

                      {/* Card Name */}
                      <h3 className="font-outfit font-black text-base uppercase tracking-tighter">
                        {def?.name || "Unknown Card"}
                      </h3>

                      {/* Card Type Badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`
                          inline-block px-2 py-1 text-xs font-outfit font-bold uppercase
                          ${
                            isMonster
                              ? "bg-red-100 text-red-700 border-red-300"
                              : ""
                          }
                          ${
                            isSpell
                              ? "bg-green-100 text-green-700 border-green-300"
                              : ""
                          }
                          ${
                            isTrap
                              ? "bg-purple-100 text-purple-700 border-purple-300"
                              : ""
                          }
                          border-2
                        `}
                        >
                          {isMonster && "Stereotype"}
                          {isSpell && "Spell"}
                          {isTrap && "Trap"}
                          {!isMonster && !isSpell && !isTrap && cardType}
                        </span>

                        {/* Level for monsters */}
                        {isMonster && def?.level && (
                          <span className="text-xs font-mono text-foreground/60">
                            Lv.{def.level}
                          </span>
                        )}
                      </div>

                      {/* Stats for monsters */}
                      {isMonster && (
                        <div className="flex justify-between text-sm font-mono">
                          <span className="text-red-600">
                            ATK {def?.attack ?? "?"}
                          </span>
                          <span className="text-blue-600">
                            DEF {def?.defense ?? "?"}
                          </span>
                        </div>
                      )}

                      {/* Archetype Label */}
                      {def?.archetype && (
                        <p className="text-xs font-outfit font-bold uppercase tracking-wide text-foreground/60">
                          {def.archetype.replace(/_/g, " ")}
                        </p>
                      )}

                      {/* Effect preview (truncated) */}
                      {def?.effect && (
                        <p className="text-xs text-foreground/50 line-clamp-2 font-special">
                          {def.effect}
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t-2 border-[#121212]">
            <button onClick={onClose} className="w-full tcg-button text-sm">
              CLOSE
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

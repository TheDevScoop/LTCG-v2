import { motion, AnimatePresence } from "framer-motion";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface AttackTargetSelectorProps {
  targets: Array<{
    cardId: string;
    definitionId: string;
    faceDown: boolean;
    position: string;
  }>;
  cardLookup: Record<string, any>;
  attackerAtk: number;
  canDirectAttack: boolean;
  onSelectTarget: (targetId: string) => void;
  onDirectAttack: () => void;
  onCancel: () => void;
}

export function AttackTargetSelector({
  targets,
  cardLookup,
  attackerAtk,
  canDirectAttack,
  onSelectTarget,
  onDirectAttack,
  onCancel,
}: AttackTargetSelectorProps) {
  const getPredictionColor = (target: any, targetDef: any) => {
    if (target.faceDown) {
      return "border-gray-400";
    }

    const targetStat =
      target.position === "attack" ? targetDef?.attack : targetDef?.defense;

    if (targetStat === undefined || targetStat === null) {
      return "border-gray-400";
    }

    if (attackerAtk > targetStat) {
      return "border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]";
    } else if (attackerAtk < targetStat) {
      return "border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]";
    } else {
      return "border-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.4)]";
    }
  };

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
          className="relative paper-panel max-w-3xl w-full max-h-[80vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="text-center">
              <h2 className="font-outfit font-black text-3xl uppercase tracking-tighter">
                SELECT ATTACK TARGET
              </h2>
              <p className="font-outfit font-bold text-lg mt-2">
                Your ATK: {attackerAtk}
              </p>
            </div>

            {/* Targets */}
            {targets.length === 0 && !canDirectAttack ? (
              <div className="text-center py-12">
                <p className="font-outfit font-bold text-lg text-foreground/40">
                  No valid targets
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Monster Targets */}
                {targets.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {targets.map((target) => {
                      const def = cardLookup[target.definitionId];
                      const theme = getArchetypeTheme(def?.archetype);
                      const borderColor = getPredictionColor(target, def);

                      return (
                        <button
                          key={target.cardId}
                          onClick={() => onSelectTarget(target.cardId)}
                          className={`
                            relative paper-panel-flat p-3 transition-all
                            hover:scale-105 active:scale-95
                            ${borderColor} border-4
                          `}
                        >
                          {/* Face-down indicator */}
                          {target.faceDown ? (
                            <div className="space-y-2">
                              <div className="h-2 w-full mb-2 bg-gradient-to-r from-gray-600 to-gray-400" />
                              <p className="font-outfit font-black text-sm uppercase tracking-tighter">
                                FACE-DOWN
                              </p>
                              <p className="text-xs text-foreground/60">
                                {target.position === "attack"
                                  ? "ATK Position"
                                  : "DEF Position"}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Archetype Stripe */}
                              <div
                                className={`h-2 w-full mb-2 bg-gradient-to-r ${theme.gradient}`}
                              />

                              {/* Card Name */}
                              <h3 className="font-outfit font-black text-sm uppercase tracking-tighter">
                                {def?.name || "Unknown"}
                              </h3>

                              {/* Stats */}
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-mono">
                                  <span className="text-red-600">
                                    ATK {def?.attack ?? "?"}
                                  </span>
                                  <span className="text-blue-600">
                                    DEF {def?.defense ?? "?"}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/60">
                                  {target.position === "attack"
                                    ? "ATK Position"
                                    : "DEF Position"}
                                </p>
                              </div>

                              {/* Battle Prediction */}
                              <div className="text-xs font-outfit font-bold">
                                {target.position === "attack" &&
                                  def?.attack !== undefined && (
                                    <>
                                      {attackerAtk > def.attack && (
                                        <span className="text-green-600">
                                          ✓ WIN
                                        </span>
                                      )}
                                      {attackerAtk < def.attack && (
                                        <span className="text-red-600">
                                          ✗ LOSE
                                        </span>
                                      )}
                                      {attackerAtk === def.attack && (
                                        <span className="text-yellow-600">
                                          ≈ DRAW
                                        </span>
                                      )}
                                    </>
                                  )}
                                {target.position === "defense" &&
                                  def?.defense !== undefined && (
                                    <>
                                      {attackerAtk > def.defense && (
                                        <span className="text-green-600">
                                          ✓ WIN
                                        </span>
                                      )}
                                      {attackerAtk < def.defense && (
                                        <span className="text-red-600">
                                          ✗ LOSE
                                        </span>
                                      )}
                                      {attackerAtk === def.defense && (
                                        <span className="text-yellow-600">
                                          ≈ DRAW
                                        </span>
                                      )}
                                    </>
                                  )}
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Direct Attack */}
                {canDirectAttack && (
                  <button
                    onClick={onDirectAttack}
                    className="w-full tcg-button-primary text-lg py-4"
                  >
                    DIRECT ATTACK
                  </button>
                )}
              </div>
            )}

            {/* Cancel Button */}
            <button onClick={onCancel} className="w-full tcg-button text-sm">
              CANCEL
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

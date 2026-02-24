import { motion, AnimatePresence } from "framer-motion";

interface ActionSheetProps {
  cardId: string;
  cardDef: any;
  location: "hand" | "backrow";
  validActions: {
    canSummon?: { positions: ("attack" | "defense")[]; needsTribute: boolean };
    canSetMonster?: boolean;
    canSetSpellTrap?: boolean;
    canActivateSpell?: boolean;
    canActivateTrap?: boolean;
    canFlipSummon?: boolean;
  };
  onSummon?: (position: "attack" | "defense") => void;
  onSetMonster?: () => void;
  onSetSpellTrap?: () => void;
  onActivateSpell?: () => void;
  onActivateTrap?: () => void;
  onFlipSummon?: () => void;
  onTributeRequired?: () => void;
  onClose: () => void;
}

export function ActionSheet({
  cardDef,
  location,
  validActions,
  onSummon,
  onSetMonster,
  onSetSpellTrap,
  onActivateSpell,
  onActivateTrap,
  onFlipSummon,
  onTributeRequired,
  onClose,
}: ActionSheetProps) {
  const isMonster =
    cardDef.type === "stereotype" || cardDef.cardType === "stereotype";
  const isSpell = cardDef.type === "spell" || cardDef.cardType === "spell";
  const isTrap = cardDef.type === "trap" || cardDef.cardType === "trap";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-40 flex items-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50"
        />

        {/* Sheet */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full paper-panel max-h-[70vh] overflow-y-auto tcg-scrollbar"
        >
          <div className="p-6 space-y-4">
            {/* Card Name */}
            <h2 className="font-outfit font-black text-2xl uppercase tracking-tighter text-center">
              {cardDef.name || "Unknown Card"}
            </h2>

            {/* Action Buttons */}
            <div className="space-y-2">
              {/* Monster in Hand */}
              {location === "hand" && isMonster && (
                <>
                  {validActions.canSummon && !validActions.canSummon.needsTribute && (
                    <>
                      {validActions.canSummon.positions.includes("attack") && (
                        <button
                          onClick={() => onSummon?.("attack")}
                          className="w-full tcg-button text-sm"
                        >
                          SUMMON ATTACK
                        </button>
                      )}
                      {validActions.canSummon.positions.includes("defense") && (
                        <button
                          onClick={() => onSummon?.("defense")}
                          className="w-full tcg-button text-sm"
                        >
                          SUMMON DEFENSE
                        </button>
                      )}
                    </>
                  )}

                  {validActions.canSummon && validActions.canSummon.needsTribute && (
                    <button
                      onClick={() => onTributeRequired?.()}
                      className="w-full tcg-button text-sm"
                    >
                      SUMMON (TRIBUTE REQUIRED)
                    </button>
                  )}

                  {validActions.canSetMonster && (
                    <button
                      onClick={() => onSetMonster?.()}
                      className="w-full tcg-button text-sm"
                    >
                      SET FACE-DOWN
                    </button>
                  )}
                </>
              )}

              {/* Spell in Hand */}
              {location === "hand" && isSpell && (
                <>
                  {validActions.canActivateSpell && (
                    <button
                      onClick={() => onActivateSpell?.()}
                      className="w-full tcg-button text-sm"
                    >
                      ACTIVATE
                    </button>
                  )}
                  {validActions.canSetSpellTrap && (
                    <button
                      onClick={() => onSetSpellTrap?.()}
                      className="w-full tcg-button text-sm"
                    >
                      SET FACE-DOWN
                    </button>
                  )}
                </>
              )}

              {/* Trap in Hand */}
              {location === "hand" && isTrap && (
                <>
                  {validActions.canSetSpellTrap && (
                    <button
                      onClick={() => onSetSpellTrap?.()}
                      className="w-full tcg-button text-sm"
                    >
                      SET FACE-DOWN
                    </button>
                  )}
                </>
              )}

              {/* Set Spell in Backrow */}
              {location === "backrow" && isSpell && (
                <>
                  {validActions.canActivateSpell && (
                    <button
                      onClick={() => onActivateSpell?.()}
                      className="w-full tcg-button text-sm"
                    >
                      ACTIVATE
                    </button>
                  )}
                </>
              )}

              {/* Set Trap in Backrow */}
              {location === "backrow" && isTrap && (
                <>
                  {validActions.canActivateTrap && (
                    <button
                      onClick={() => onActivateTrap?.()}
                      className="w-full tcg-button text-sm"
                    >
                      ACTIVATE
                    </button>
                  )}
                </>
              )}

              {/* Flip Summon */}
              {validActions.canFlipSummon && (
                <button
                  onClick={() => onFlipSummon?.()}
                  className="w-full tcg-button text-sm"
                >
                  FLIP SUMMON
                </button>
              )}

              {/* Cancel */}
              <button
                onClick={onClose}
                className="w-full tcg-button-primary text-sm"
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

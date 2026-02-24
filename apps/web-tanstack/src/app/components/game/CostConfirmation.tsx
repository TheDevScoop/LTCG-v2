import { motion, AnimatePresence } from "framer-motion";

export interface EffectCost {
  /** Number of monsters to tribute. */
  tributeCount?: number;
  /** Number of cards to discard. */
  discardCount?: number;
  /** LP to pay. */
  lpCost?: number;
  /** Custom cost description (e.g., "Banish 1 card from your graveyard"). */
  customDescription?: string;
}

interface CostConfirmationProps {
  /** Name of the card whose effect is being activated. */
  cardName: string;
  /** The costs the player must pay. */
  cost: EffectCost;
  /** Called when the player confirms the activation. */
  onConfirm: () => void;
  /** Called when the player cancels. */
  onCancel: () => void;
}

export function CostConfirmation({
  cardName,
  cost,
  onConfirm,
  onCancel,
}: CostConfirmationProps) {
  const costLines: string[] = [];
  if (cost.tributeCount && cost.tributeCount > 0) {
    costLines.push(
      `Tribute ${cost.tributeCount} monster${cost.tributeCount > 1 ? "s" : ""}`,
    );
  }
  if (cost.discardCount && cost.discardCount > 0) {
    costLines.push(
      `Discard ${cost.discardCount} card${cost.discardCount > 1 ? "s" : ""}`,
    );
  }
  if (cost.lpCost && cost.lpCost > 0) {
    costLines.push(`Pay ${cost.lpCost} LP`);
  }
  if (cost.customDescription) {
    costLines.push(cost.customDescription);
  }

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
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="relative bg-black border-2 border-[#121212] max-w-sm w-full"
        >
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2
                className="font-black text-xl uppercase tracking-tighter text-white"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                ACTIVATION COST
              </h2>
              <p
                className="text-sm text-[#ffcc00] italic"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                {cardName}
              </p>
            </div>

            {/* Cost Details */}
            <div className="border-2 border-white/10 bg-white/5 p-4 space-y-2">
              <p
                className="text-[9px] uppercase tracking-widest text-white/40 font-bold mb-2"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Required Costs
              </p>

              {costLines.length === 0 ? (
                <p
                  className="text-sm text-white/50"
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  No additional cost required.
                </p>
              ) : (
                costLines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#ffcc00] shrink-0" />
                    <p
                      className="text-sm text-white font-bold uppercase tracking-tight"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {line}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Warning */}
            {(cost.lpCost ?? 0) > 0 && (
              <p
                className="text-[10px] text-red-400 text-center italic"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                Your LP will be reduced by {cost.lpCost}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onConfirm}
                className="flex-1 bg-[#ffcc00] border-2 border-[#ffcc00] text-[#121212] font-black uppercase tracking-wider text-sm py-3 hover:bg-[#ffd633] transition-colors"
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

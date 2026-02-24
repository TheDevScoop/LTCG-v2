import { motion, AnimatePresence } from "framer-motion";

interface DamageNumberProps {
  amount: number | null;
  /** Unique key to retrigger animation */
  triggerKey: number;
}

/**
 * Floating damage/heal number that pops up and fades.
 * Red for damage, green for heals.
 */
export function DamageNumber({ amount, triggerKey }: DamageNumberProps) {
  if (amount === null || amount === 0) return null;

  const isDamage = amount < 0;
  const display = isDamage ? `${amount}` : `+${amount}`;

  return (
    <AnimatePresence>
      <motion.div
        key={triggerKey}
        className="fixed left-1/2 top-1/2 z-50 pointer-events-none"
        initial={{
          opacity: 1,
          y: 0,
          x: "-50%",
          scale: 1.5,
        }}
        animate={{
          opacity: 0,
          y: isDamage ? 60 : -60,
          scale: 0.8,
        }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 1.2,
          type: "spring",
          stiffness: 100,
          damping: 15,
        }}
      >
        <span
          className={`font-['Special_Elite'] font-black text-5xl ${
            isDamage ? "text-[#ef4444]" : "text-[#22c55e]"
          }`}
          style={{
            textShadow: "3px 3px 0 rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)",
          }}
        >
          {display}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

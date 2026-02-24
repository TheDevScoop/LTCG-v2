import { motion, AnimatePresence } from "framer-motion";
import { useStory } from "./StoryProvider";

export function BattleTransition() {
  const { currentEvent, advanceEvent } = useStory();

  if (!currentEvent || currentEvent.type !== "transition") return null;

  return (
    <AnimatePresence>
      <TransitionOverlay variant={currentEvent.variant} onComplete={advanceEvent} />
    </AnimatePresence>
  );
}

function TransitionOverlay({
  variant,
  onComplete,
}: {
  variant: "battle-start" | "victory" | "defeat";
  onComplete: () => void;
}) {
  if (variant === "battle-start") {
    return (
      <motion.div
        className="fixed inset-0 z-[70] bg-[#121212] flex items-center justify-center"
        initial={{ clipPath: "circle(0% at 50% 50%)" }}
        animate={{ clipPath: "circle(150% at 50% 50%)" }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        onAnimationComplete={onComplete}
        onClick={onComplete}
      >
        <motion.h1
          className="text-6xl md:text-8xl text-white"
          style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          FIGHT!
        </motion.h1>
      </motion.div>
    );
  }

  if (variant === "victory") {
    return (
      <motion.div
        className="fixed inset-0 z-[70] bg-[#fdfdfb] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        onAnimationComplete={() => setTimeout(onComplete, 600)}
      >
        <motion.div className="text-center">
          <motion.div
            className="text-7xl md:text-9xl"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900, color: "#ffcc00" }}
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 8, stiffness: 100 }}
          >
            &#9733;
          </motion.div>
          <motion.h1
            className="text-5xl md:text-7xl mt-2"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            VICTORY
          </motion.h1>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] bg-[#121212] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onAnimationComplete={() => setTimeout(onComplete, 600)}
    >
      <motion.h1
        className="text-5xl md:text-7xl text-[#e53e3e]"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", damping: 10 }}
      >
        DEFEAT
      </motion.h1>
    </motion.div>
  );
}

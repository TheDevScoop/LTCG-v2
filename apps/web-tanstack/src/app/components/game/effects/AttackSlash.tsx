import { motion, AnimatePresence } from "framer-motion";
import { ImpactFlash } from "./ImpactFlash";
import { useState } from "react";

interface AttackSlashProps {
  visible: boolean;
  onComplete?: () => void;
}

/**
 * Multi-phase attack effect:
 * Phase 1 (0-300ms): Gold slash sweep
 * Phase 2 (250-400ms): White flash + shockwave ring (ImpactFlash)
 * Phase 3: Board shake via CSS class (applied by parent)
 */
export function AttackSlash({ visible, onComplete }: AttackSlashProps) {
  const [showFlash, setShowFlash] = useState(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 pointer-events-none"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Phase 1: Gold slash sweep */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, transparent 30%, rgba(255,204,0,0.6) 48%, rgba(255,255,255,0.9) 50%, rgba(255,204,0,0.6) 52%, transparent 70%)",
            }}
            initial={{
              clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
            }}
            animate={{
              clipPath: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
            }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            onAnimationComplete={() => setShowFlash(true)}
          />

          {/* Phase 2: Impact flash + shockwave */}
          <ImpactFlash
            visible={showFlash}
            onComplete={() => {
              setShowFlash(false);
              onComplete?.();
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

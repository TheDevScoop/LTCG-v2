import { motion, AnimatePresence } from "framer-motion";

interface ImpactFlashProps {
  visible: boolean;
  onComplete?: () => void;
}

/**
 * Full-screen white flash + expanding shockwave ring on combat impact.
 * Triggered alongside AttackSlash phase 2.
 */
export function ImpactFlash({ visible, onComplete }: ImpactFlashProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[51] pointer-events-none"
          initial={{ opacity: 0 }}
          exit={{ opacity: 0 }}
        >
          {/* White flash */}
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            transition={{ duration: 0.35, ease: "easeOut", times: [0, 0.3, 1] }}
            onAnimationComplete={onComplete}
          />

          {/* Shockwave ring */}
          <motion.div
            className="absolute top-1/2 left-1/2 pointer-events-none"
            style={{
              width: 80,
              height: 80,
              marginLeft: -40,
              marginTop: -40,
              borderRadius: "50%",
              border: "2px solid rgba(255, 204, 0, 0.6)",
            }}
            initial={{ scale: 0.5, opacity: 0.8 }}
            animate={{ scale: 6, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

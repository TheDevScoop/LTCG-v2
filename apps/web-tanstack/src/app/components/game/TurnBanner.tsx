import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";

interface TurnBannerProps {
  turnNumber: number;
  isMyTurn: boolean;
}

export function TurnBanner({ turnNumber, isMyTurn }: TurnBannerProps) {
  const [visible, setVisible] = useState(false);
  const prevTurnRef = useRef<number>(-1);

  useEffect(() => {
    prevTurnRef.current = turnNumber;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1400);
    return () => clearTimeout(timer);
  }, [turnNumber]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          {/* Dark scrim */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            style={{ backgroundColor: "#121212" }}
          />

          {/* Banner stripe */}
          <motion.div
            className="relative w-full overflow-hidden"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0, transition: { duration: 0.2, delay: 0.1 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              height: "120px",
              backgroundColor: isMyTurn ? "#ffcc00" : "#121212",
              transformOrigin: "center",
              boxShadow: isMyTurn
                ? "0 0 60px rgba(255, 204, 0, 0.6), 0 0 120px rgba(255, 204, 0, 0.3)"
                : "0 0 60px rgba(0, 0, 0, 0.8)",
            }}
          >
            {/* Torn paper edges */}
            <div
              className="absolute top-0 left-0 right-0 h-2"
              style={{
                background: isMyTurn ? "#121212" : "#fdfdfb",
                clipPath:
                  "polygon(0% 100%, 2% 40%, 5% 90%, 7% 30%, 10% 80%, 13% 20%, 16% 70%, 19% 40%, 22% 90%, 25% 30%, 28% 80%, 31% 50%, 34% 100%, 37% 20%, 40% 70%, 43% 40%, 46% 90%, 49% 50%, 52% 80%, 55% 30%, 58% 100%, 61% 40%, 64% 70%, 67% 20%, 70% 90%, 73% 50%, 76% 80%, 79% 30%, 82% 100%, 85% 40%, 88% 70%, 91% 20%, 94% 90%, 97% 50%, 100% 80%)",
                opacity: 0.15,
              }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-2"
              style={{
                background: isMyTurn ? "#121212" : "#fdfdfb",
                clipPath:
                  "polygon(0% 0%, 3% 60%, 6% 10%, 9% 70%, 12% 20%, 15% 80%, 18% 30%, 21% 60%, 24% 0%, 27% 70%, 30% 20%, 33% 50%, 36% 0%, 39% 80%, 42% 30%, 45% 60%, 48% 10%, 51% 50%, 54% 20%, 57% 0%, 60% 60%, 63% 30%, 66% 70%, 69% 0%, 72% 50%, 75% 20%, 78% 80%, 81% 30%, 84% 0%, 87% 60%, 90% 30%, 93% 80%, 96% 10%, 100% 50%)",
                opacity: 0.15,
              }}
            />

            {/* Main text */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ x: isMyTurn ? -600 : 600, skewX: isMyTurn ? -8 : 8 }}
              animate={{ x: 0, skewX: 0 }}
              exit={{ x: isMyTurn ? 600 : -600, skewX: isMyTurn ? 8 : -8 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 22,
                mass: 1.2,
              }}
            >
              <span
                className="font-['Outfit'] font-black uppercase tracking-[-0.06em] select-none"
                style={{
                  fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
                  color: isMyTurn ? "#121212" : "#fdfdfb",
                  textShadow: isMyTurn
                    ? "2px 2px 0px rgba(0,0,0,0.1)"
                    : "2px 2px 0px rgba(255,204,0,0.3)",
                  letterSpacing: "-0.04em",
                }}
              >
                {isMyTurn ? "YOUR TURN" : "ENEMY TURN"}
              </span>
            </motion.div>

            {/* Accent line */}
            <motion.div
              className="absolute bottom-3 left-1/2"
              initial={{ width: 0, x: "-50%" }}
              animate={{ width: "40%", x: "-50%" }}
              transition={{ delay: 0.2, duration: 0.3, ease: "easeOut" }}
              style={{
                height: "3px",
                backgroundColor: isMyTurn ? "#121212" : "#ffcc00",
                opacity: 0.6,
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

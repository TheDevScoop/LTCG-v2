import { useState, useEffect } from "react";
import { useNavigate } from "@/router/react-router";
import { motion } from "framer-motion";

type VictoryProps = {
  won: boolean;
  rewards?: { gold?: number; xp?: number; firstClearBonus?: number };
  starsEarned?: number;
  onPlayDialogue?: () => void;
  nextStageAvailable?: boolean;
  storyPath?: string;
};

export function VictoryScreen({
  won,
  rewards,
  starsEarned = 0,
  onPlayDialogue,
  nextStageAvailable,
  storyPath = "/story",
}: VictoryProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      className={`min-h-screen flex items-center justify-center p-6 ${won ? 'bg-[#fdfdfb]' : 'bg-black bg-cover bg-center'}`}
      style={!won ? { backgroundImage: "url('/assets/defeat-bg.png')" } : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="paper-panel p-8 md:p-12 text-center max-w-md w-full">
        <motion.h1
          className="text-5xl md:text-6xl mb-2"
          style={{
            fontFamily: "Outfit, sans-serif",
            fontWeight: 900,
            color: won ? "#121212" : "#e53e3e",
          }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 10 }}
        >
          {won ? "VICTORY" : "DEFEAT"}
        </motion.h1>

        <motion.p
          className="text-sm text-[#666] mb-6"
          style={{ fontFamily: "Special Elite, cursive" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {won
            ? "You proved your worth at the table."
            : "The hallway isn't done with you yet."}
        </motion.p>

        {won && starsEarned > 0 && (
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3].map((n) => (
              <motion.span
                key={n}
                className="text-4xl"
                style={{ color: n <= starsEarned ? "#ffcc00" : "#ddd" }}
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  delay: 0.5 + n * 0.2,
                  type: "spring",
                  damping: 8,
                  stiffness: 150,
                }}
              >
                &#9733;
              </motion.span>
            ))}
          </div>
        )}

        {won && rewards && (rewards.gold || rewards.xp) && (
          <motion.div
            className="paper-panel-flat p-4 mb-6 text-left"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider mb-2"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              REWARDS
            </p>
            <div className="flex gap-4 text-sm">
              {rewards.gold && (
                <AnimatedCounter label="gold" value={rewards.gold} delay={1.0} />
              )}
              {rewards.xp && (
                <AnimatedCounter label="xp" value={rewards.xp} delay={1.2} />
              )}
            </div>
            {rewards.firstClearBonus && (
              <motion.p
                className="text-xs mt-2 font-bold uppercase"
                style={{ color: "#ffcc00" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
              >
                First Clear Bonus: +{rewards.firstClearBonus}
              </motion.p>
            )}
          </motion.div>
        )}

        <motion.div
          className="flex flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: won ? 1.6 : 0.6 }}
        >
          {won && nextStageAvailable && (
            <button
              type="button"
              onClick={onPlayDialogue}
              className="tcg-button-primary px-8 py-3 text-lg w-full"
            >
              NEXT STAGE &rarr;
            </button>
          )}
          {!won && (
            <button
              type="button"
              onClick={() => navigate(storyPath)}
              className="tcg-button-primary px-8 py-3 text-lg w-full"
            >
              TRY AGAIN
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/story")}
            className={`${won && nextStageAvailable ? "tcg-button" : won ? "tcg-button-primary" : "tcg-button"} px-8 py-3 text-lg w-full`}
          >
            BACK TO MAP
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function AnimatedCounter({
  label,
  value,
  delay,
}: {
  label: string;
  value: number;
  delay: number;
}) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let current = 0;
      const step = Math.max(1, Math.ceil(value / 20));
      const interval = setInterval(() => {
        current = Math.min(current + step, value);
        setDisplayed(current);
        if (current >= value) clearInterval(interval);
      }, 40);
      return () => clearInterval(interval);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [value, delay]);

  return (
    <span style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
      +{displayed} <span className="text-[10px] text-[#999] uppercase">{label}</span>
    </span>
  );
}

import { motion, AnimatePresence } from "framer-motion";
import type { VisualEvent } from "./hooks/useVisualEvents";

export function GameEffectsLayer({ events }: { events: VisualEvent[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <AnimatePresence>
        {events.map((evt) => {
          switch (evt.type) {
            case "attack_slash":
              return <AttackSlash key={evt.id} />;
            case "spell_flash":
              return (
                <SpellFlash
                  key={evt.id}
                  cardName={(evt.data?.cardName as string) ?? "Spell"}
                />
              );
            case "trap_snap":
              return (
                <TrapSnap
                  key={evt.id}
                  cardName={(evt.data?.cardName as string) ?? "Trap"}
                />
              );
            case "effect_burst":
              return (
                <EffectBurst
                  key={evt.id}
                  cardName={(evt.data?.cardName as string) ?? "Effect"}
                />
              );
            case "card_destroyed":
              return (
                <DestroyFlash
                  key={evt.id}
                  cardName={(evt.data?.cardName as string) ?? "Card"}
                />
              );
            default:
              return null;
          }
        })}
      </AnimatePresence>
    </div>
  );
}

// ── Attack Slash ──────────────────────────────────────────────────
// Diagonal golden slash sweeps across the screen when an attack lands

function AttackSlash() {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      {/* Slash diagonal */}
      <motion.div
        className="absolute inset-0"
        initial={{ clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)" }}
        animate={{
          clipPath: [
            "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
            "polygon(0% 0%, 60% 0%, 100% 100%, 40% 100%)",
            "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
          ],
        }}
        transition={{ duration: 0.35, ease: "easeOut", times: [0, 0.5, 1] }}
        style={{
          background:
            "linear-gradient(135deg, transparent 38%, rgba(255, 200, 50, 0.25) 45%, rgba(255, 255, 255, 0.9) 50%, rgba(255, 200, 50, 0.25) 55%, transparent 62%)",
        }}
      />

      {/* Center impact flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.4, times: [0, 0.15, 1] }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255, 220, 80, 0.35) 0%, transparent 55%)",
        }}
      />

      {/* Speed lines */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            top: `${20 + i * 15}%`,
            left: 0,
            right: 0,
            height: "1px",
            background: `linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, ${0.15 + i * 0.05}) 30%, rgba(255, 255, 255, ${0.3 + i * 0.05}) 50%, rgba(255, 255, 255, ${0.15 + i * 0.05}) 70%, transparent 100%)`,
            transform: `rotate(${-25 + i * 3}deg) scaleX(1.5)`,
          }}
          initial={{ opacity: 0, x: -200 }}
          animate={{ opacity: [0, 0.8, 0], x: [- 200, 0, 200] }}
          transition={{ duration: 0.3, delay: i * 0.02, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

// ── Spell Flash ──────────────────────────────────────────────────
// Cyan expanding ring + card name banner for spell activation

function SpellFlash({ cardName }: { cardName: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Expanding ring */}
      <motion.div
        className="absolute rounded-full border-2"
        style={{ width: 120, height: 120, borderColor: "rgba(51, 204, 255, 0.8)" }}
        initial={{ scale: 0.3, opacity: 0.9 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />

      {/* Second ring */}
      <motion.div
        className="absolute rounded-full border"
        style={{ width: 80, height: 80, borderColor: "rgba(51, 204, 255, 0.5)" }}
        initial={{ scale: 0.5, opacity: 0.7 }}
        animate={{ scale: 5, opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
      />

      {/* Glow flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.25, 0] }}
        transition={{ duration: 0.5 }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(51, 204, 255, 0.3) 0%, transparent 50%)",
        }}
      />

      {/* Name banner */}
      <EffectNameBanner label="SPELL" cardName={cardName} color="#33ccff" />
    </motion.div>
  );
}

// ── Trap Snap ──────────────────────────────────────────────────
// Red/purple flash with snap effect for trap activation

function TrapSnap({ cardName }: { cardName: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Vertical snap lines */}
      {[-1, 1].map((dir) => (
        <motion.div
          key={dir}
          className="absolute h-full w-[2px]"
          style={{
            left: "50%",
            background:
              "linear-gradient(180deg, transparent 10%, rgba(239, 68, 68, 0.8) 40%, rgba(168, 85, 247, 0.8) 60%, transparent 90%)",
          }}
          initial={{ scaleY: 0, x: dir * 60 }}
          animate={{ scaleY: [0, 1, 0], x: dir * 60 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      ))}

      {/* Red flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.2, 0] }}
        transition={{ duration: 0.4 }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.25) 0%, transparent 50%)",
        }}
      />

      {/* Name banner */}
      <EffectNameBanner label="TRAP" cardName={cardName} color="#ef4444" />
    </motion.div>
  );
}

// ── Effect Burst ──────────────────────────────────────────────
// Yellow burst for monster effect activation

function EffectBurst({ cardName }: { cardName: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Starburst rays */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            width: 2,
            height: 60,
            left: "50%",
            top: "50%",
            transformOrigin: "center bottom",
            background:
              "linear-gradient(180deg, rgba(255, 204, 0, 0.6) 0%, transparent 100%)",
            transform: `translate(-50%, -100%) rotate(${i * 45}deg)`,
          }}
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: [0, 1.5, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
        />
      ))}

      {/* Center flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.3, 0] }}
        transition={{ duration: 0.5 }}
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255, 204, 0, 0.35) 0%, transparent 45%)",
        }}
      />

      {/* Name banner */}
      <EffectNameBanner label="EFFECT" cardName={cardName} color="#ffcc00" />
    </motion.div>
  );
}

// ── Destroy Flash ──────────────────────────────────────────────
// Brief red flash when a card is destroyed

function DestroyFlash({ cardName }: { cardName: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      {/* Shattering particles */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * 360;
        const rad = (angle * Math.PI) / 180;
        const dist = 60 + Math.random() * 40;
        return (
          <motion.div
            key={i}
            className="absolute w-2 h-2"
            style={{
              left: "50%",
              top: "50%",
              background: i % 3 === 0 ? "#ef4444" : i % 3 === 1 ? "#ffcc00" : "#fff",
              boxShadow: `0 0 4px ${i % 3 === 0 ? "#ef4444" : "#ffcc00"}`,
            }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos(rad) * dist,
              y: Math.sin(rad) * dist,
              scale: 0,
              opacity: 0,
              rotate: 180 + Math.random() * 360,
            }}
            transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.015 }}
          />
        );
      })}

      {/* Red flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ duration: 0.3 }}
        style={{ background: "rgba(239, 68, 68, 0.2)" }}
      />

      {/* Destroyed label */}
      <motion.div
        className="absolute top-[38%] left-0 right-0 flex justify-center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 0.9] }}
        transition={{ duration: 1, times: [0, 0.2, 0.7, 1] }}
      >
        <span
          className="font-['Outfit'] font-black uppercase text-sm tracking-wider px-3 py-1"
          style={{
            color: "#ef4444",
            textShadow: "2px 2px 0 rgba(0,0,0,0.8), 0 0 12px rgba(239, 68, 68, 0.5)",
          }}
        >
          {cardName} DESTROYED
        </span>
      </motion.div>
    </motion.div>
  );
}

// ── Shared Effect Name Banner ──────────────────────────────────
// Compact banner showing card name + effect type (like a mini TurnBanner)

function EffectNameBanner({
  label,
  cardName,
  color,
}: {
  label: string;
  cardName: string;
  color: string;
}) {
  return (
    <motion.div
      className="absolute top-[30%] left-0 right-0 flex justify-center z-10"
      initial={{ opacity: 0, y: 10, scaleX: 0.3 }}
      animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -5], scaleX: [0.3, 1, 1, 0.8] }}
      transition={{ duration: 1.2, times: [0, 0.15, 0.7, 1], ease: "easeOut" }}
    >
      <div
        className="relative overflow-hidden px-6 py-2"
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(18, 18, 18, 0.85) 15%, rgba(18, 18, 18, 0.9) 50%, rgba(18, 18, 18, 0.85) 85%, transparent 100%)`,
        }}
      >
        {/* Accent line top */}
        <div
          className="absolute top-0 left-[10%] right-[10%] h-[2px]"
          style={{ background: color }}
        />

        <div className="flex items-center gap-3">
          <span
            className="font-['Outfit'] font-black uppercase text-[10px] tracking-widest"
            style={{ color }}
          >
            {label}
          </span>
          <span
            className="font-['Outfit'] font-black uppercase text-base tracking-tight text-white/90"
            style={{
              textShadow: `0 0 8px ${color}40`,
            }}
          >
            {cardName}
          </span>
        </div>

        {/* Accent line bottom */}
        <div
          className="absolute bottom-0 left-[10%] right-[10%] h-[1px]"
          style={{ background: `${color}60` }}
        />
      </div>
    </motion.div>
  );
}

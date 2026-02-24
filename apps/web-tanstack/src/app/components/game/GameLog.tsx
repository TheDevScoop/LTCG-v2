import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, useConvexQuery } from "@/lib/convexHelpers";
import { BUBBLE_SPEECH, BUBBLE_BURST, BUBBLE_WAVY } from "@/lib/blobUrls";
import type { Seat } from "./hooks/useGameState";

interface EventBatch {
  command: string;
  events: string;
  seat: string;
  version: number;
  createdAt: number;
}

interface LogEntry {
  id: string;
  text: string;
  actor: "you" | "opponent" | "system";
  type: "action" | "combat" | "system";
  bubbleStyle: number;
}

const COMMAND_LABELS: Record<string, { label: string; type: LogEntry["type"] }> = {
  SUMMON: { label: "SUMMONED!", type: "combat" },
  SET_MONSTER: { label: "SET A STEREOTYPE", type: "action" },
  FLIP_SUMMON: { label: "FLIP SUMMON!", type: "combat" },
  SET_SPELL_TRAP: { label: "SET A CARD", type: "action" },
  ACTIVATE_SPELL: { label: "SPELL ACTIVATE!", type: "combat" },
  ACTIVATE_TRAP: { label: "TRAP SPRUNG!", type: "combat" },
  ACTIVATE_EFFECT: { label: "EFFECT!", type: "combat" },
  DECLARE_ATTACK: { label: "ATTACKS!", type: "combat" },
  END_TURN: { label: "END TURN", type: "system" },
  CHAIN_RESPONSE: { label: "CHAIN!", type: "action" },
  SURRENDER: { label: "SURRENDERED!", type: "combat" },
};

// Cycle through bubble images
const BUBBLE_IMAGES = [BUBBLE_SPEECH, BUBBLE_BURST, BUBBLE_WAVY];

function parseLogEntries(batches: EventBatch[], mySeat: Seat): LogEntry[] {
  const entries: LogEntry[] = [];
  let bubbleIdx = 0;

  for (const batch of batches) {
    let cmd: Record<string, unknown> = {};
    try {
      cmd = JSON.parse(batch.command);
    } catch {
      continue;
    }
    const cmdType = typeof cmd.type === "string" ? cmd.type : "";
    const info = COMMAND_LABELS[cmdType];
    if (!info) continue;

    const actor: LogEntry["actor"] =
      batch.seat === mySeat ? "you" : "opponent";

    const passedChain = cmdType === "CHAIN_RESPONSE" && cmd.pass === true;
    const text = passedChain ? "PASS" : info.label;

    entries.push({
      id: `${batch.version}-${cmdType}`,
      text,
      actor,
      type: info.type,
      bubbleStyle: bubbleIdx % BUBBLE_IMAGES.length,
    });
    bubbleIdx++;
  }
  return entries;
}

const DISPLAY_DURATION = 4000;
const MAX_VISIBLE = 4;

interface VisibleEntry extends LogEntry {
  showAt: number;
}

interface GameLogProps {
  matchId: string;
  seat: Seat;
}

export function GameLog({ matchId, seat }: GameLogProps) {
  const rawEvents = useConvexQuery(api.game.getRecentEvents, {
    matchId,
    sinceVersion: 0,
  }) as EventBatch[] | undefined;

  const allEntries = useMemo(() => {
    if (!rawEvents || !Array.isArray(rawEvents)) return [];
    return parseLogEntries(rawEvents, seat);
  }, [rawEvents, seat]);

  const [visible, setVisible] = useState<VisibleEntry[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    return () => { seenRef.current.clear(); };
  }, []);

  // When new entries arrive, queue them for display
  useEffect(() => {
    const newEntries: LogEntry[] = [];
    for (const entry of allEntries) {
      if (!seenRef.current.has(entry.id)) {
        seenRef.current.add(entry.id);
        newEntries.push(entry);
      }
    }
    if (newEntries.length === 0) return;

    const now = Date.now();
    const toAdd = newEntries.slice(-MAX_VISIBLE).map((e, i) => ({
      ...e,
      showAt: now + i * 200,
    }));

    setVisible((prev) => [...prev, ...toAdd].slice(-MAX_VISIBLE * 2));
  }, [allEntries]);

  // Auto-remove after DISPLAY_DURATION
  useEffect(() => {
    if (visible.length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - DISPLAY_DURATION;
      setVisible((prev) => prev.filter((e) => e.showAt > cutoff));
    }, 500);
    return () => clearInterval(timer);
  }, [visible.length]);

  const recent = visible.slice(-MAX_VISIBLE);

  return (
    <div className="fixed inset-x-0 top-[52%] z-30 pointer-events-none flex flex-col items-center gap-3 px-4">
      <AnimatePresence mode="popLayout">
        {recent.map((entry) => (
          <ComicBubble key={entry.id} entry={entry} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ComicBubble({ entry }: { entry: VisibleEntry }) {
  const isPlayer = entry.actor === "you";
  const isOpponent = entry.actor === "opponent";
  const bubbleSrc = BUBBLE_IMAGES[entry.bubbleStyle];

  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        scale: 0.3,
        x: isPlayer ? -80 : isOpponent ? 80 : 0,
      }}
      animate={{
        opacity: 1,
        scale: 1,
        x: isPlayer ? -40 : isOpponent ? 40 : 0,
      }}
      exit={{
        opacity: 0,
        scale: 0.6,
        y: -20,
      }}
      transition={{ type: "spring", damping: 16, stiffness: 200 }}
      className={`relative flex items-center ${
        isPlayer ? "self-start" : isOpponent ? "self-end" : "self-center"
      }`}
    >
      {/* Bubble image background */}
      <div className="relative w-[180px] h-[80px] flex items-center justify-center">
        <img
          src={bubbleSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-contain drop-shadow-md"
          style={{
            transform: isOpponent ? "scaleX(-1)" : undefined,
          }}
          draggable={false}
        />
        {/* Text inside bubble */}
        <div className="relative z-10 text-center px-6 pb-2">
          <p
            className="font-['Special_Elite'] text-[10px] text-[#666] uppercase tracking-wide leading-none"
          >
            {isPlayer ? "YOU" : isOpponent ? "FOE" : ""}
          </p>
          <p
            className="font-['Special_Elite'] text-sm text-[#121212] font-bold leading-tight mt-0.5"
            style={{ textShadow: "0 0 8px rgba(255,255,255,0.8)" }}
          >
            {entry.text}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

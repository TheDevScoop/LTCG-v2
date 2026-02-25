import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useStory, type DialogueLine } from "./StoryProvider";
import {
  MILUNCHLADY_CLASSIC, MILUNCHLADY_GOTH, MILUNCHLADY_CYBER,
  MILUNCHLADY_HYPEBEAST, MILUNCHLADY_PREP, MILUNCHLADY_GAMER,
  MILUNCHLADY_PFP,
} from "@/lib/blobUrls";

const SPEAKER_AVATARS: Record<string, string> = {
  milunchlady: MILUNCHLADY_CLASSIC,
  "milunchlady-goth": MILUNCHLADY_GOTH,
  "milunchlady-cyber": MILUNCHLADY_CYBER,
  "milunchlady-hypebeast": MILUNCHLADY_HYPEBEAST,
  "milunchlady-prep": MILUNCHLADY_PREP,
  "milunchlady-gamer": MILUNCHLADY_GAMER,
};

const DEFAULT_AVATAR = MILUNCHLADY_PFP;
const CHAR_DELAY = 30;

function getAvatar(speaker: string, lineAvatar?: string): string {
  if (lineAvatar) return lineAvatar;
  const key = speaker.toLowerCase().replace(/\s+/g, "-");
  return SPEAKER_AVATARS[key] ?? DEFAULT_AVATAR;
}

export function DialogueBox() {
  const { currentEvent, advanceEvent } = useStory();

  if (!currentEvent || currentEvent.type !== "dialogue") return null;

  return (
    <DialogueSequence
      lines={currentEvent.lines}
      defaultAvatar={currentEvent.avatar}
      onComplete={advanceEvent}
    />
  );
}

function DialogueSequence({
  lines,
  defaultAvatar,
  onComplete,
}: {
  lines: DialogueLine[];
  defaultAvatar?: string;
  onComplete: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  const currentLine = lines[lineIndex];
  const fullText = currentLine?.text ?? "";

  useEffect(() => {
    if (!currentLine) return;
    setDisplayedText("");
    setIsTyping(true);

    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i >= fullText.length) {
        setDisplayedText(fullText);
        setIsTyping(false);
        clearInterval(interval);
      } else {
        setDisplayedText(fullText.slice(0, i));
      }
    }, CHAR_DELAY);

    return () => clearInterval(interval);
  }, [lineIndex, fullText, currentLine]);

  const handleTap = useCallback(() => {
    if (isTyping) {
      setDisplayedText(fullText);
      setIsTyping(false);
    } else if (lineIndex < lines.length - 1) {
      setLineIndex((prev) => prev + 1);
    } else {
      onComplete();
    }
  }, [isTyping, fullText, lineIndex, lines.length, onComplete]);

  if (!currentLine) return null;

  const avatar = getAvatar(currentLine.speaker, currentLine.avatar ?? defaultAvatar);
  const isMilunchlady = currentLine.speaker.toLowerCase().includes("milunchlady") ||
    currentLine.speaker.toLowerCase().includes("lunchlady");

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleTap}
      style={{ cursor: "pointer" }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <motion.div
        className="relative w-full max-w-2xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="flex gap-4 items-end">
          <motion.div
            className="shrink-0 w-20 h-20 md:w-24 md:h-24 border-2 border-[#121212] bg-white overflow-hidden"
            style={{ boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)" }}
            animate={{ y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            <img
              src={avatar}
              alt={currentLine.speaker}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </motion.div>

          <div className="flex-1 paper-panel p-4 md:p-5">
            <p
              className="text-xs font-bold uppercase tracking-wider mb-2"
              style={{
                fontFamily: "Permanent Marker, Outfit, sans-serif",
                color: isMilunchlady ? "#ffcc00" : "#121212",
              }}
            >
              {currentLine.speaker}
            </p>

            <p
              className="text-sm md:text-base leading-relaxed min-h-[3em]"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              {displayedText}
              {isTyping && (
                <span className="inline-block w-2 h-4 bg-[#121212] ml-0.5 animate-pulse" />
              )}
            </p>

            <p className="text-[10px] text-[#999] uppercase tracking-wider text-right mt-2">
              {isTyping
                ? "tap to skip"
                : lineIndex < lines.length - 1
                  ? "tap to continue"
                  : "tap to close"}
            </p>
          </div>
        </div>

        {lines.length > 1 && (
          <div className="flex gap-1 justify-center mt-3">
            {lines.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 border border-[#121212] transition-colors ${
                  i <= lineIndex ? "bg-[#121212]" : "bg-transparent"
                }`}
              />
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

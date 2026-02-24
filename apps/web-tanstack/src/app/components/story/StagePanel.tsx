import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import { useStory, type Stage } from "./StoryProvider";

import {
  STAGE_1_1_1,
  STAGE_1_1_2,
  STAGE_1_1_3,
} from "@/lib/blobUrls";

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "#38a169",
  medium: "#d69e2e",
  hard: "#e53e3e",
  boss: "#805ad5",
};

/**
 * Map "Act-Chapter-Stage" to banner image.
 * e.g. "1-1-1" = Act 1, Chapter 1, Stage 1
 */
const STAGE_BANNERS: Record<string, string> = {
  "1-1-1": STAGE_1_1_1,
  "1-1-2": STAGE_1_1_2,
  "1-1-3": STAGE_1_1_3,
};

const panelVariant = {
  hidden: { opacity: 0, scale: 0.92, y: 16 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, damping: 18, stiffness: 220 },
  },
};

type StagePanelProps = {
  stage: Stage;
  isStarting: boolean;
  onFight: () => void;
  onHostAgentFight?: () => void;
  chapterId?: string;
  locked?: boolean;
};

export function StagePanel({
  stage,
  isStarting,
  onFight,
  onHostAgentFight,
  chapterId,
  locked = false,
}: StagePanelProps) {
  const { isStageComplete, getStageStars, chapters } = useStory();
  const completed = isStageComplete(stage._id);
  const stars = getStageStars(stage._id);
  const diffColor = DIFFICULTY_COLORS[stage.difficulty ?? "easy"] ?? "#666";

  // Resolve banner image.
  const chapter = chapters?.find((entry) => entry._id === chapterId);
  const bannerKey = chapter
    ? `${chapter.actNumber}-${chapter.chapterNumber}-${stage.stageNumber}`
    : null;
  const bannerImage = bannerKey ? STAGE_BANNERS[bannerKey] : null;

  const canFight = !isStarting && !locked;

  const handleFight = (event: MouseEvent<HTMLButtonElement>) => {
    if (!canFight) return;
    if (onHostAgentFight && (event.metaKey || event.shiftKey)) {
      onHostAgentFight();
      return;
    }
    onFight();
  };

  return (
    <motion.button
      type="button"
      onClick={handleFight}
      disabled={!canFight}
      className={`comic-panel relative overflow-hidden text-left group w-full h-full ${
        completed ? "opacity-75" : ""
      } ${!canFight ? "cursor-not-allowed" : "cursor-pointer"}`}
      variants={panelVariant}
      whileHover={!canFight ? undefined : { scale: 1.02, zIndex: 10 }}
      whileTap={{ scale: 0.97 }}
    >
      {locked && (
        <div className="absolute inset-0 z-20 bg-[#121212]/55 border-2 border-[#121212]/60 flex items-center justify-center">
          <span className="comic-stamp border-white/70 text-white/90">LOCKED</span>
        </div>
      )}

      {/* Panel image */}
      {bannerImage && (
        <img
          src={bannerImage}
          alt={`Stage ${stage.stageNumber} - ${stage.name || chapter?.title || "Battle stage"}`}
          className={`absolute inset-0 w-full h-full object-cover transition-all ${
            completed
              ? "opacity-40 grayscale"
              : locked
                ? "opacity-30"
                : "opacity-60 group-hover:opacity-75 grayscale-[0.3]"
          }`}
          draggable={false}
        />
      )}

      {/* Bottom gradient for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      {/* Completed overlay */}
      {completed && (
        <div className="absolute top-3 right-3 z-20">
          <span className="comic-stamp text-[#38a169] border-[#38a169] bg-white/90 text-[10px]">
            CLEARED
          </span>
        </div>
      )}

      {/* Content pinned to bottom */}
      <div className="relative z-10 flex flex-col justify-end h-full p-4 md:p-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] uppercase tracking-wider text-white/60"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Stage {stage.stageNumber}
          </span>
          {stage.difficulty && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border"
              style={{ borderColor: diffColor, color: diffColor }}
            >
              {stage.difficulty}
            </span>
          )}
        </div>

        <h2
          className="text-lg md:text-xl leading-tight text-white"
          style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
        >
          {stage.title ?? stage.name ?? `Stage ${stage.stageNumber}`}
        </h2>

        {stage.opponentName && (
          <p
            className="text-xs text-white/50 mt-0.5 uppercase tracking-wider"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            vs. {stage.opponentName}
          </p>
        )}

        {/* Stars */}
        {completed && (
          <div className="flex gap-0.5 mt-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className="text-sm"
                style={{ color: n <= stars ? "#ffcc00" : "#666" }}
              >
                &#9733;
              </span>
            ))}
          </div>
        )}

        {/* Rewards */}
        {(stage.rewardGold || stage.rewardXp) && !completed && (
          <div className="flex gap-3 mt-1.5">
            {stage.rewardGold && (
              <span className="text-[10px] text-[#ffcc00]/80 uppercase">
                +{stage.rewardGold} gold
              </span>
            )}
            {stage.rewardXp && (
              <span className="text-[10px] text-white/50 uppercase">
                +{stage.rewardXp} xp
              </span>
            )}
          </div>
        )}

        {/* Fight prompt */}
        {!completed && (
          <span className="text-[10px] text-[#ffcc00] font-bold uppercase tracking-wider mt-2 animate-pulse">
            {isStarting ? "Loading..." : locked ? "Locked" : "Click to fight"}
          </span>
        )}

        {/* Optional locked overlay */}
        {locked && !completed && (
          <span
            className="absolute top-3 left-3 text-[9px] tracking-wider font-black uppercase text-white/80 bg-black/70 border border-white/40 px-2 py-1 z-20"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Unavailable
          </span>
        )}

        {!completed && onHostAgentFight && canFight && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onHostAgentFight();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onHostAgentFight();
            }}
            className="mt-2 inline-flex w-fit text-[10px] text-[#121212] bg-[#ffcc00] px-2 py-1 rounded-sm font-bold uppercase tracking-wider border border-[#121212] hover:bg-[#ffd95c]"
          >
            Host for autonomous agent
          </span>
        )}
      </div>
    </motion.button>
  );
}

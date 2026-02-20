import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConvexAuth } from "convex/react";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";
import { TrayNav } from "@/components/layout/TrayNav";
import { RankCard } from "@/components/ranked/RankCard";
import { TierBadge, TIER_COLORS, TIER_ORDER } from "@/components/ranked/TierBadge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

// ── Types ────────────────────────────────────────────────────────

type LeaderboardPlayer = {
  userId: string;
  username: string;
  rating: number;
  tier: string;
  gamesPlayed: number;
  peakRating: number;
};

type PlayerRankData = {
  rank: number | null;
  rating: number;
  peakRating?: number;
  tier: string;
  gamesPlayed: number;
  ratingHistory?: Array<{
    rating: number;
    change: number;
    opponentRating: number;
    result: "win" | "loss";
    timestamp: number;
  }>;
};

type TierDistribution = {
  distribution: Record<string, number>;
  totalPlayers: number;
};

// ── Distribution Bar ─────────────────────────────────────────────

function TierDistributionBar({ data }: { data: TierDistribution }) {
  const { distribution, totalPlayers } = data;
  if (totalPlayers === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="border-2 border-[#121212] p-4 mb-6"
      style={{
        backgroundColor: "#fdfdfb",
        boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)",
      }}
    >
      <h3
        className="text-xs uppercase tracking-widest text-[#121212]/50 mb-3"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        Tier Distribution ({totalPlayers} player{totalPlayers === 1 ? "" : "s"})
      </h3>
      <div className="flex h-6 border-2 border-[#121212] overflow-hidden">
        {TIER_ORDER.map((tier) => {
          const count = distribution[tier] ?? 0;
          const pct = (count / totalPlayers) * 100;
          if (pct === 0) return null;
          return (
            <motion.div
              key={tier}
              className="relative group"
              style={{
                backgroundColor: TIER_COLORS[tier],
                minWidth: count > 0 ? "2px" : 0,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
              title={`${tier}: ${count} (${pct.toFixed(1)}%)`}
            >
              {pct > 10 && (
                <span
                  className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    color:
                      tier === "platinum" || tier === "diamond"
                        ? "#121212"
                        : "#fff",
                    textShadow:
                      tier === "platinum" || tier === "diamond"
                        ? "none"
                        : "1px 1px 0 rgba(0,0,0,0.3)",
                  }}
                >
                  {Math.round(pct)}%
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {TIER_ORDER.map((tier) => {
          const count = distribution[tier] ?? 0;
          return (
            <span
              key={tier}
              className="text-[10px] uppercase tracking-wider text-[#121212]/60"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              <span
                className="inline-block w-2 h-2 mr-1 border border-[#121212]"
                style={{ backgroundColor: TIER_COLORS[tier] }}
              />
              {tier}: {count}
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Loading State ────────────────────────────────────────────────

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-14 border-2 border-[#121212]/10 animate-pulse"
          style={{ backgroundColor: i % 2 === 0 ? "#f9f9f7" : "#fdfdfb" }}
        />
      ))}
    </div>
  );
}

// ── Row Animation Variants ───────────────────────────────────────

const rowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.3, ease: "easeOut" as const },
  }),
};

// ── Tabs ─────────────────────────────────────────────────────────

type TabId = "all" | "bronze" | "silver" | "gold" | "platinum" | "diamond";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All Tiers" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "diamond", label: "Diamond" },
];

// ── Main Component ───────────────────────────────────────────────

export function Leaderboard() {
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<TabId>("all");

  // Queries
  const leaderboard = useConvexQuery(
    apiAny.ranked.getLeaderboard,
    { limit: 50 },
  ) as LeaderboardPlayer[] | undefined;

  const myRank = useConvexQuery(
    apiAny.ranked.getPlayerRank,
    isAuthenticated ? {} : "skip",
  ) as PlayerRankData | undefined;

  const distribution = useConvexQuery(
    apiAny.ranked.getRankDistribution,
    {},
  ) as TierDistribution | undefined;

  // Filter leaderboard by selected tier
  const filteredLeaderboard = leaderboard?.filter((p) =>
    activeTab === "all" ? true : p.tier === activeTab,
  );

  const isLoading = leaderboard === undefined;

  return (
    <div className="min-h-screen bg-[#fdfdfb] pb-28">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        {/* Header */}
        <header className="text-center mb-8">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-[#121212] mb-2"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Leaderboard
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[#121212]/60 text-sm uppercase tracking-wider"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Ranked players by ELO rating
          </motion.p>
        </header>

        {/* Personal Rank Card (auth only) */}
        {isAuthenticated && myRank && (
          <div className="mb-6">
            <RankCard
              rank={myRank.rank}
              rating={myRank.rating}
              peakRating={myRank.peakRating}
              tier={myRank.tier}
              gamesPlayed={myRank.gamesPlayed}
              ratingHistory={myRank.ratingHistory}
            />
          </div>
        )}

        {/* Tier Distribution */}
        {distribution && distribution.totalPlayers > 0 && (
          <TierDistributionBar data={distribution} />
        )}

        {/* Tier Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-[#121212]"
              style={{ fontFamily: "Outfit, sans-serif", color: activeTab === tab.id ? "#fff" : "#121212" }}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="leaderboard-tab"
                  className="absolute inset-0 bg-[#121212]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Leaderboard Table */}
        <div
          className="border-2 border-[#121212] overflow-hidden"
          style={{ boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)" }}
        >
          {/* Table Header */}
          <div
            className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem] md:grid-cols-[4rem_1fr_6rem_6rem_6rem] items-center px-3 py-3 border-b-2 border-[#121212]"
            style={{ backgroundColor: "#121212" }}
          >
            <span
              className="text-xs font-black uppercase tracking-wider text-white"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              #
            </span>
            <span
              className="text-xs font-black uppercase tracking-wider text-white"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Player
            </span>
            <span
              className="text-xs font-black uppercase tracking-wider text-white text-right"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Rating
            </span>
            <span
              className="text-xs font-black uppercase tracking-wider text-white text-right hidden md:block"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Peak
            </span>
            <span
              className="text-xs font-black uppercase tracking-wider text-white text-right"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Games
            </span>
          </div>

          {/* Table Body */}
          {isLoading ? (
            <div className="p-4">
              <LeaderboardSkeleton />
            </div>
          ) : filteredLeaderboard && filteredLeaderboard.length > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {filteredLeaderboard.map((player, index) => {
                  const isCurrentUser =
                    isAuthenticated &&
                    myRank &&
                    myRank.rank !== null &&
                    myRank.rating === player.rating;

                  return (
                    <motion.div
                      key={player.userId}
                      custom={index}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      className={`grid grid-cols-[3rem_1fr_5rem_5rem_5rem] md:grid-cols-[4rem_1fr_6rem_6rem_6rem] items-center px-3 py-3 border-b border-[#121212]/10 transition-colors ${
                        isCurrentUser
                          ? "bg-[#ffcc00]/20"
                          : index % 2 === 0
                            ? "bg-[#fdfdfb]"
                            : "bg-[#f5f5f3]"
                      }`}
                    >
                      {/* Rank */}
                      <span
                        className="text-lg font-black"
                        style={{
                          fontFamily: "Outfit, sans-serif",
                          color:
                            index === 0
                              ? "#ffcc00"
                              : index === 1
                                ? "#c0c0c0"
                                : index === 2
                                  ? "#cd7f32"
                                  : "#121212",
                          textShadow:
                            index === 0
                              ? "0 0 8px rgba(255,204,0,0.6)"
                              : index === 1
                                ? "0 0 8px rgba(192,192,192,0.6)"
                                : index === 2
                                  ? "0 0 8px rgba(205,127,50,0.6)"
                                  : "none",
                        }}
                      >
                        {index + 1}
                      </span>

                      {/* Player Name + Tier Badge */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-bold text-[#121212] truncate"
                          style={{ fontFamily: "Special Elite, cursive" }}
                        >
                          {player.username}
                        </span>
                        <TierBadge tier={player.tier} size="sm" />
                        {isCurrentUser && (
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-[#ffcc00] text-[#121212] border border-[#121212]"
                            style={{ fontFamily: "Outfit, sans-serif" }}
                          >
                            You
                          </span>
                        )}
                      </div>

                      {/* Rating */}
                      <AnimatedNumber
                        value={player.rating}
                        duration={600}
                        delay={index * 30}
                        className="text-sm font-black text-[#121212] text-right tabular-nums block"
                      />

                      {/* Peak Rating */}
                      <AnimatedNumber
                        value={player.peakRating}
                        duration={600}
                        delay={index * 30}
                        className="text-sm font-bold text-[#121212]/50 text-right tabular-nums hidden md:block"
                      />

                      {/* Games Played */}
                      <AnimatedNumber
                        value={player.gamesPlayed}
                        duration={600}
                        delay={index * 30}
                        className="text-sm font-bold text-[#121212]/50 text-right tabular-nums block"
                      />
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="p-8 text-center">
              <p
                className="text-[#121212]/40 text-sm uppercase tracking-wider"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                {activeTab === "all"
                  ? "No ranked players yet. Be the first to climb."
                  : `No players in ${activeTab} tier yet.`}
              </p>
            </div>
          )}
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

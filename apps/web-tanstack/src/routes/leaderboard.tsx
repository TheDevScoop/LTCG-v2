import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useMemo, useState } from "react";
import { RankCard } from "~/components/ranked/RankCard";
import { TierBadge, TIER_COLORS, TIER_ORDER } from "~/components/ranked/TierBadge";
import { AnimatedNumber } from "~/components/ui/AnimatedNumber";
import { api } from "~/lib/convexApi";

type LeaderboardPlayer = {
  userId: string;
  username: string;
  rating: number;
  tier: string;
  gamesPlayed: number;
  peakRating: number;
};

type PlayerRankData = {
  userId?: string;
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

type TierFilter = "all" | "bronze" | "silver" | "gold" | "platinum" | "diamond";

const leaderboardQuery = convexQuery(api.ranked.getLeaderboard, { limit: 100 });
const distributionQuery = convexQuery(api.ranked.getRankDistribution, {});
const myRankQuery = convexQuery(api.ranked.getPlayerRank, {});

const TABS: { id: TierFilter; label: string }[] = [
  { id: "all", label: "All Tiers" },
  { id: "bronze", label: "Bronze" },
  { id: "silver", label: "Silver" },
  { id: "gold", label: "Gold" },
  { id: "platinum", label: "Platinum" },
  { id: "diamond", label: "Diamond" },
];

export const Route = createFileRoute("/leaderboard")({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return;
    await Promise.all([
      context.queryClient.ensureQueryData(leaderboardQuery),
      context.queryClient.ensureQueryData(distributionQuery),
    ]);
  },
  component: LeaderboardRoute,
});

function LeaderboardRoute() {
  const { convexConfigured } = Route.useRouteContext();
  const { isAuthenticated } = useConvexAuth();
  const [activeTab, setActiveTab] = useState<TierFilter>("all");

  const leaderboard = useQuery({
    ...leaderboardQuery,
    enabled: convexConfigured,
  });
  const distribution = useQuery({
    ...distributionQuery,
    enabled: convexConfigured,
  });
  const myRank = useQuery({
    ...myRankQuery,
    enabled: convexConfigured && isAuthenticated,
  });

  const filteredLeaderboard = useMemo(() => {
    const rows = (leaderboard.data ?? []) as LeaderboardPlayer[];
    if (activeTab === "all") return rows;
    return rows.filter((entry) => entry.tier === activeTab);
  }, [activeTab, leaderboard.data]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black uppercase tracking-tight text-stone-100">
          Leaderboard
        </h1>
        <p className="text-sm text-stone-400">Ranked players by ELO rating.</p>
      </header>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load ranked data.
        </p>
      ) : (
        <>
          {isAuthenticated && myRank.data && (
            <RankCard
              rank={(myRank.data as PlayerRankData).rank}
              rating={(myRank.data as PlayerRankData).rating}
              peakRating={(myRank.data as PlayerRankData).peakRating}
              tier={(myRank.data as PlayerRankData).tier}
              gamesPlayed={(myRank.data as PlayerRankData).gamesPlayed}
              ratingHistory={(myRank.data as PlayerRankData).ratingHistory}
            />
          )}

          <TierDistributionBar data={distribution.data as TierDistribution | undefined} />

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                  activeTab === tab.id
                    ? "border-stone-100 text-stone-100"
                    : "border-stone-700 text-stone-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {leaderboard.isLoading ? (
            <LeaderboardSkeleton />
          ) : leaderboard.isError ? (
            <p className="text-sm text-rose-300">Failed to load leaderboard.</p>
          ) : filteredLeaderboard.length === 0 ? (
            <p className="text-sm text-stone-400">No ranked players yet.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-stone-700/40">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-700/40 bg-stone-900/60 text-xs uppercase tracking-wide text-stone-300">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2 text-right">Rating</th>
                    <th className="px-3 py-2 text-right">Peak</th>
                    <th className="px-3 py-2 text-right">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((player, index) => {
                    const myUserId = (myRank.data as PlayerRankData | undefined)?.userId;
                    const isCurrentUser = typeof myUserId === "string" && myUserId === player.userId;
                    return (
                      <tr
                        key={player.userId}
                        className={`border-b border-stone-700/30 last:border-b-0 ${
                          isCurrentUser ? "bg-amber-100/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-medium">#{index + 1}</td>
                        <td className="px-3 py-2">
                          <span className={isCurrentUser ? "font-semibold text-amber-200" : "text-stone-100"}>
                            {player.username}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <TierBadge tier={player.tier} size="sm" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <AnimatedNumber value={player.rating} />
                        </td>
                        <td className="px-3 py-2 text-right text-stone-400">{player.peakRating}</td>
                        <td className="px-3 py-2 text-right text-stone-300">{player.gamesPlayed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TierDistributionBar({ data }: { data: TierDistribution | undefined }) {
  if (!data || data.totalPlayers === 0) return null;

  const { distribution, totalPlayers } = data;

  return (
    <div className="rounded border border-stone-700/40 p-3">
      <h2 className="mb-2 text-sm uppercase tracking-wide text-stone-300">
        Tier distribution ({totalPlayers} players)
      </h2>
      <div className="h-3 overflow-hidden rounded border border-stone-700/40">
        <div className="flex h-full">
          {TIER_ORDER.map((tier) => {
            const count = distribution[tier] ?? 0;
            if (count === 0) return null;
            const pct = (count / totalPlayers) * 100;
            return (
              <div
                key={tier}
                title={`${tier}: ${count}`}
                style={{
                  width: `${pct}%`,
                  backgroundColor: TIER_COLORS[tier],
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 md:grid-cols-3">
        {TIER_ORDER.map((tier) => {
          const count = distribution[tier] ?? 0;
          const pct = totalPlayers > 0 ? Math.round((count / totalPlayers) * 100) : 0;
          return (
            <div key={tier} className="flex items-center justify-between text-xs">
              <span className="capitalize text-stone-300">{tier}</span>
              <span className="text-stone-500">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-11 animate-pulse rounded border border-stone-700/40 bg-stone-900/30"
        />
      ))}
    </div>
  );
}

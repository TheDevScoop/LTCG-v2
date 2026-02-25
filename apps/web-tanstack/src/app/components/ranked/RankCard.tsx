import { motion } from "framer-motion";
import { TierBadge } from "./TierBadge";

type RatingHistoryEntry = {
  rating: number;
  change: number;
  result: "win" | "loss";
  timestamp: number;
};

type RankCardProps = {
  rank: number | null;
  rating: number;
  peakRating?: number;
  tier: string;
  gamesPlayed: number;
  ratingHistory?: RatingHistoryEntry[];
};

function RatingSparkline({ history }: { history: RatingHistoryEntry[] }) {
  const recent = history.slice(0, 10).reverse();
  if (recent.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 mt-2">
      <span
        className="text-[10px] uppercase tracking-wider mr-1.5 text-[#121212]/60"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        Recent
      </span>
      {recent.map((entry, i) => (
        <span
          key={`${entry.timestamp}-${i}`}
          className="text-xs font-black"
          style={{
            fontFamily: "Outfit, sans-serif",
            color: entry.change >= 0 ? "#16a34a" : "#dc2626",
          }}
          title={`${entry.change >= 0 ? "+" : ""}${entry.change} (${entry.result})`}
        >
          {entry.change >= 0 ? "+" : "-"}
        </span>
      ))}
    </div>
  );
}

export function RankCard({
  rank,
  rating,
  peakRating,
  tier,
  gamesPlayed,
  ratingHistory = [],
}: RankCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative"
      style={{
        clipPath:
          "polygon(0% 3%, 3% 0%, 7% 2%, 12% 0%, 18% 3%, 24% 1%, 30% 4%, 36% 2%, 42% 5%, 48% 3%, 54% 6%, 60% 4%, 66% 7%, 72% 5%, 78% 8%, 84% 6%, 90% 9%, 95% 7%, 100% 10%, 100% 100%, 0% 100%)",
      }}
    >
      <div
        className="p-5 pt-8 border-2 border-[#121212]"
        style={{
          backgroundColor: "#fdfdfb",
          boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3
              className="text-xs uppercase tracking-widest text-[#121212]/50 mb-1"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Your Rank
            </h3>
            <div className="flex items-baseline gap-3">
              <span
                className="text-4xl font-black text-[#121212]"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {rank !== null ? `#${rank}` : "Unranked"}
              </span>
              <TierBadge tier={tier} size="md" />
            </div>

            <div className="mt-3 flex items-baseline gap-4">
              <div>
                <span
                  className="text-[10px] uppercase tracking-widest text-[#121212]/50 block"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Rating
                </span>
                <span
                  className="text-2xl font-black text-[#121212]"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {rating}
                </span>
              </div>

              {peakRating !== undefined && (
                <div>
                  <span
                    className="text-[10px] uppercase tracking-widest text-[#121212]/50 block"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Peak
                  </span>
                  <span
                    className="text-lg font-bold text-[#121212]/70"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {peakRating}
                  </span>
                </div>
              )}

              <div>
                <span
                  className="text-[10px] uppercase tracking-widest text-[#121212]/50 block"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Games
                </span>
                <span
                  className="text-lg font-bold text-[#121212]/70"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {gamesPlayed}
                </span>
              </div>
            </div>

            <RatingSparkline history={ratingHistory} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

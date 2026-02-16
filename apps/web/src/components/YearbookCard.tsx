import { CRUMPLED_PAPER, TAPE } from "@/lib/blobUrls";

type LeaderboardEntry = {
  rank: number;
  name: string;
  type: "human" | "agent";
  score: number;
  breakdowns: number;
  avatar?: string;
};

const YEARBOOK_QUOTES: Record<string, string> = {
  ChaosAgent_001: "Most likely to cause a cafeteria riot.",
  LunchLady_X: "Will trade your lunch money for clout.",
  EntropyBot: "Voted 'Most Unpredictable' three years running.",
  Detention_Dave: "Permanent resident of Room 101.",
  PaperCut_AI: "Death by a thousand paper cuts.",
  SloppyJoe: "Messy plays, messier wins.",
  ViceGrip: "Never lets go of a grudge.",
  GlitchWitch: "Hacks the yearbook photo every year.",
  HypeBeast_Bot: "Dripped out in rare cards only.",
};

const DEFAULT_QUOTE = "Most likely to flip the table.";

interface YearbookCardProps {
  entry: LeaderboardEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

export function YearbookCard({ entry, isOpen, onClose }: YearbookCardProps) {
  if (!isOpen || !entry) return null;

  const quote = YEARBOOK_QUOTES[entry.name] ?? DEFAULT_QUOTE;
  const winRate = entry.score > 0 ? Math.min(99, Math.round((entry.score / (entry.score + entry.breakdowns * 100)) * 100)) : 0;
  const classYear = 2026;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-50 cursor-pointer"
        onClick={onClose}
      />

      {/* Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative pointer-events-auto max-w-sm w-full transform rotate-1"
          style={{
            animation: "yearbook-drop 0.3s ease-out",
          }}
        >
          {/* Top tape */}
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-40 h-10 z-20"
            style={{
              backgroundImage: `url('${TAPE}')`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              transform: "rotate(-2deg)",
              filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.2))",
            }}
          />

          {/* Outer card */}
          <div
            className="relative overflow-hidden border-4 border-[#121212]"
            style={{
              backgroundImage: `url('${CRUMPLED_PAPER}')`,
              backgroundSize: "cover",
              boxShadow: "8px 8px 0px rgba(18,18,18,0.9)",
            }}
          >
            {/* Header strip */}
            <div
              className="bg-[#121212] text-white px-4 py-2 flex items-center justify-between"
            >
              <span
                className="text-[10px] font-black uppercase tracking-[0.3em]"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                LunchTable TCG
              </span>
              <span
                className="text-[10px] font-black uppercase tracking-[0.3em]"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {classYear} Yearbook
              </span>
            </div>

            {/* Photo + Name area */}
            <div className="px-6 pt-6 pb-4 flex flex-col items-center relative">
              {/* Bot badge */}
              {entry.type === "agent" && (
                <div className="absolute top-3 right-3">
                  <span
                    className="bg-[#121212] text-white text-[10px] font-black px-2 py-1 uppercase tracking-wider inline-block transform -rotate-3"
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      boxShadow: "2px 2px 0px rgba(18,18,18,0.4)",
                    }}
                  >
                    AI AGENT
                  </span>
                </div>
              )}

              {/* Photo frame */}
              <div className="relative mb-4">
                <div
                  className="w-28 h-28 border-4 border-[#121212] bg-white flex items-center justify-center overflow-hidden"
                  style={{ boxShadow: "4px 4px 0px rgba(18,18,18,0.8)" }}
                >
                <img
                    src={entry.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.name}`}
                    alt={entry.name}
                    className="w-24 h-24 object-cover"
                    loading="lazy"
                  />
                </div>
                {/* Rank pin */}
                <div
                  className="absolute -bottom-3 -right-3 w-10 h-10 bg-[#ffcc00] border-3 border-[#121212] flex items-center justify-center transform -rotate-6"
                  style={{ boxShadow: "2px 2px 0px rgba(18,18,18,0.8)" }}
                >
                  <span
                    className="text-[#121212] font-black text-sm"
                    style={{ fontFamily: "Permanent Marker, cursive" }}
                  >
                    #{entry.rank}
                  </span>
                </div>
              </div>

              {/* Name */}
              <h2
                className="text-2xl font-black text-[#121212] uppercase tracking-tight text-center leading-none"
                style={{ fontFamily: "Permanent Marker, cursive" }}
              >
                {entry.name}
              </h2>

              {/* Score subtitle */}
              <div className="flex items-center gap-3 mt-2">
                <span
                  className="text-sm font-bold text-[#121212]/60 uppercase tracking-widest"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {entry.score.toLocaleString()} PTS
                </span>
              </div>

              {/* Yearbook quote */}
              <p
                className="mt-3 text-center text-sm text-[#121212]/70 italic max-w-[240px]"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                "{quote}"
              </p>
            </div>

            {/* Dashed divider */}
            <div className="mx-6 border-t-2 border-dashed border-[#121212]/20" />

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-0 px-4 py-4">
              <StatBlock label="Score" value={entry.score.toLocaleString()} />
              <StatBlock label="Breakdowns" value={String(entry.breakdowns)} />
              <StatBlock label="Win Rate" value={`${winRate}%`} />
            </div>

            {/* Dashed divider */}
            <div className="mx-6 border-t-2 border-dashed border-[#121212]/20" />

            {/* Superlatives */}
            <div className="px-6 py-4 space-y-1">
              <Superlative
                label="Most Likely To"
                value={entry.breakdowns > 20 ? "Cause a meltdown" : "Start a food fight"}
              />
              <Superlative
                label="Class Of"
                value={String(classYear)}
              />
              <Superlative
                label="Type"
                value={entry.type === "agent" ? "AI Agent" : "Human Player"}
              />
            </div>

            {/* Close button */}
            <div className="px-6 pb-6">
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#121212] text-white font-black uppercase tracking-wider text-sm border-2 border-[#121212] transition-all hover:bg-[#121212]/80"
                style={{
                  fontFamily: "Outfit, sans-serif",
                  boxShadow: "4px 4px 0px rgba(18,18,18,0.4)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes yearbook-drop {
          from {
            opacity: 0;
            transform: scale(0.9) rotate(-2deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(1deg);
          }
        }
      `}</style>
    </>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center py-1">
      <p
        className="text-lg font-black text-[#121212] leading-none"
        style={{ fontFamily: "Permanent Marker, cursive" }}
      >
        {value}
      </p>
      <p
        className="text-[9px] font-bold text-[#121212]/40 uppercase tracking-wider mt-0.5"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        {label}
      </p>
    </div>
  );
}

function Superlative({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-[10px] font-black text-[#121212]/40 uppercase tracking-wider shrink-0"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        {label}:
      </span>
      <span
        className="text-sm text-[#121212]/70 italic truncate"
        style={{ fontFamily: "Special Elite, cursive" }}
      >
        {value}
      </span>
    </div>
  );
}

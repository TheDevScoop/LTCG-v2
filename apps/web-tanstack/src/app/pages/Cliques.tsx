import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@/router/react-router";
import { usePrivy } from "@privy-io/react-auth";
import { useConvexAuth } from "convex/react";
import { motion, type Variants } from "framer-motion";
import {
  Crown,
  LoaderCircle,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { TrayNav } from "@/components/layout/TrayNav";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { LANDING_BG } from "@/lib/blobUrls";
import { getArchetypeTheme } from "@/lib/archetypeThemes";

interface Clique {
  _id: string;
  name: string;
  archetype: string;
  description: string;
  memberCount: number;
  totalWins: number;
}

interface CliqueMember {
  _id: string;
  username: string;
  name?: string;
  cliqueRole?: "member" | "leader" | "founder";
  createdAt: number;
}

interface LeaderboardClique extends Clique {
  rank: number;
  isMyClique: boolean;
}

interface CliqueDashboard {
  myArchetype: string | null;
  myClique: Clique | null;
  myCliqueMembers: CliqueMember[];
  myCliqueMemberOverflow: number;
  totalPlayers: number;
  leaderboard: LeaderboardClique[];
}

const ARCHETYPE_META: Record<string, { label: string; color: string }> = {
  dropouts: { label: "Dropouts", color: "#e53e3e" },
  preps: { label: "Preps", color: "#3182ce" },
  geeks: { label: "Geeks", color: "#d69e2e" },
  freaks: { label: "Freaks", color: "#805ad5" },
  nerds: { label: "Nerds", color: "#38a169" },
  goodies: { label: "Goodies", color: "#718096" },
};

const ARCHETYPE_ALIASES: Record<string, string> = {
  dropout: "dropouts",
  dropouts: "dropouts",
  prep: "preps",
  preps: "preps",
  geek: "geeks",
  geeks: "geeks",
  freak: "freaks",
  freaks: "freaks",
  nerd: "nerds",
  nerds: "nerds",
  goodie: "goodies",
  goodies: "goodies",
  goodie_two_shoes: "goodies",
  goodietwoshoes: "goodies",
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.32,
    },
  },
};

const normalizeArchetype = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return ARCHETYPE_ALIASES[normalized] ?? null;
};

const getArchetypeMeta = (value: string | null | undefined) => {
  const normalized = normalizeArchetype(value);
  if (!normalized) {
    return { label: "Unassigned", color: "#6b7280" };
  }
  return ARCHETYPE_META[normalized] ?? { label: normalized, color: "#6b7280" };
};

const formatRole = (role: CliqueMember["cliqueRole"]) => {
  if (role === "founder") return "Founder";
  if (role === "leader") return "Leader";
  return "Member";
};

function StatCard({
  icon,
  label,
  value,
  numericValue,
  suffix,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  numericValue?: number;
  suffix?: string;
}) {
  return (
    <div className="paper-panel-flat px-4 py-3 bg-white/90">
      <div className="flex items-center gap-2 text-[#444] text-xs uppercase tracking-wide font-bold">
        {icon}
        {label}
      </div>
      <p
        className="text-2xl text-[#121212] leading-tight mt-1"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
      >
        {numericValue != null ? (
          <AnimatedNumber value={numericValue} suffix={suffix} />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

function CliquesSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="paper-panel p-8">
        <div className="h-7 bg-[#121212]/10 w-2/5 mb-3" />
        <div className="h-4 bg-[#121212]/10 w-3/5 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-20 bg-[#121212]/10" />
          <div className="h-20 bg-[#121212]/10" />
          <div className="h-20 bg-[#121212]/10" />
        </div>
      </div>
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6">
        <div className="paper-panel p-6 h-72 bg-[#121212]/5" />
        <div className="paper-panel p-6 h-72 bg-[#121212]/5" />
      </div>
    </div>
  );
}

export function Cliques() {
  const navigate = useNavigate();
  const { authenticated } = usePrivy();
  const { isAuthenticated: convexAuthenticated } = useConvexAuth();

  const [assigning, setAssigning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attemptedAutoAssign = useRef(false);

  const dashboard = useConvexQuery(
    apiAny.cliques.getCliqueDashboard,
    authenticated && convexAuthenticated ? {} : "skip",
  ) as CliqueDashboard | undefined;

  const ensureMyCliqueAssignment = useConvexMutation(
    apiAny.cliques.ensureMyCliqueAssignment,
  );

  const myClique = dashboard?.myClique ?? null;
  const myArchetype = dashboard?.myArchetype ?? null;

  useEffect(() => {
    if (!authenticated || !convexAuthenticated || !dashboard) return;

    if (myClique) {
      attemptedAutoAssign.current = false;
      return;
    }

    if (!myArchetype || attemptedAutoAssign.current) return;

    attemptedAutoAssign.current = true;
    setAssigning(true);
    setError(null);

    ensureMyCliqueAssignment({})
      .then((result: any) => {
        if (result?.status === "assigned") {
          setNotice("Assigned to your clique from starter deck.");
        }
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Could not auto-assign clique.";
        setError(message);
      })
      .finally(() => {
        setAssigning(false);
      });
  }, [
    authenticated,
    convexAuthenticated,
    dashboard,
    ensureMyCliqueAssignment,
    myArchetype,
    myClique,
  ]);

  const myRank = useMemo(() => {
    if (!dashboard?.leaderboard?.length) return null;
    return dashboard.leaderboard.find((c) => c.isMyClique)?.rank ?? null;
  }, [dashboard]);

  const topMemberCount = dashboard?.leaderboard?.[0]?.memberCount ?? 1;
  const membershipShare = myClique
    ? Math.round((myClique.memberCount / Math.max(1, dashboard?.totalPlayers ?? 1)) * 100)
    : 0;

  const theme = getArchetypeTheme(myClique?.archetype ?? myArchetype ?? undefined);
  const archetypeMeta = getArchetypeMeta(myClique?.archetype ?? myArchetype);

  const retryAutoAssign = async () => {
    setAssigning(true);
    setError(null);
    try {
      await ensureMyCliqueAssignment({});
      setNotice("Clique assignment refreshed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not auto-assign clique.";
      setError(message);
    } finally {
      setAssigning(false);
    }
  };

  if (!authenticated) {
    return (
      <div
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{ backgroundImage: `url('${LANDING_BG}')` }}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
          <div className="paper-panel p-8 max-w-md text-center">
            <h1 className="text-3xl mb-3" style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
              CLIQUES
            </h1>
            <p className="text-sm text-[#555] mb-6" style={{ fontFamily: "Special Elite, cursive" }}>
              Sign in to view your guild and school standings.
            </p>
            <button onClick={() => navigate("/")} className="tcg-button">
              Back to Home
            </button>
          </div>
        </div>
        <TrayNav />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-hidden"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/65" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,204,0,0.18),transparent_55%)] animate-pulse" />
      <div
        className="absolute inset-0 opacity-10 transition-opacity duration-1000"
        style={{ backgroundColor: archetypeMeta.color }}
      />

      <div className="relative z-10 p-4 md:p-8 pb-28 max-w-6xl mx-auto">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-8"
        >
          <h1
            className="text-4xl md:text-6xl text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            CLIQUES
          </h1>
          <p className="text-[#ffcc00] text-base md:text-lg" style={{ fontFamily: "Special Elite, cursive" }}>
            Your school guild. Auto-assigned by starter deck.
          </p>
        </motion.header>

        {notice && (
          <div className="paper-panel-flat bg-green-600/90 text-white px-4 py-2 mb-4 font-bold uppercase text-xs">
            {notice}
          </div>
        )}

        {error && (
          <div className="paper-panel-flat bg-red-600/90 text-white px-4 py-2 mb-4 font-bold uppercase text-xs">
            {error}
          </div>
        )}

        {!dashboard ? (
          <CliquesSkeleton />
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="show">
            {myClique ? (
              <motion.section variants={itemVariants} className="paper-panel p-6 md:p-8 relative overflow-hidden">
                <div
                  className="absolute -top-20 -right-14 w-72 h-72 rounded-full opacity-20 pointer-events-none"
                  style={{ backgroundColor: archetypeMeta.color }}
                />

                <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-4xl" aria-hidden>
                        {theme.icon}
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-[#666] font-bold">
                          {archetypeMeta.label} Clique
                        </p>
                        <h2
                          className="text-3xl md:text-4xl leading-tight"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontWeight: 900,
                            color: archetypeMeta.color,
                          }}
                        >
                          {myClique.name}
                        </h2>
                      </div>
                    </div>

                    <p className="text-sm text-[#333] max-w-2xl" style={{ fontFamily: "Special Elite, cursive" }}>
                      {myClique.description}
                    </p>

                    <p className="text-xs text-[#666] uppercase tracking-wider mt-3">
                      Assigned automatically from your starter deck.
                    </p>
                  </div>

                  <div className="paper-panel-flat bg-white/85 px-4 py-3 min-w-[180px]">
                    <p className="text-xs uppercase text-[#666] tracking-wide mb-1">School Rank</p>
                    <p
                      className="text-4xl text-[#121212]"
                      style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
                    >
                      #{myRank ?? "-"}
                    </p>
                  </div>
                </div>

                <motion.div
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6"
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
                  initial="hidden"
                  animate="show"
                >
                  <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                    <StatCard icon={<Users size={14} />} label="Members" value={String(myClique.memberCount)} numericValue={myClique.memberCount} />
                  </motion.div>
                  <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                    <StatCard icon={<Trophy size={14} />} label="Total Wins" value={String(myClique.totalWins)} numericValue={myClique.totalWins} />
                  </motion.div>
                  <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
                    <StatCard icon={<Sparkles size={14} />} label="Player Share" value={`${membershipShare}%`} numericValue={membershipShare} suffix="%" />
                  </motion.div>
                </motion.div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate("/story")}
                    className="tcg-button-primary px-5 py-2.5 text-sm"
                  >
                    Queue Story Battles
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/decks")}
                    className="tcg-button px-5 py-2.5 text-sm"
                  >
                    View Decks
                  </button>
                </div>
              </motion.section>
            ) : (
              <motion.section variants={itemVariants} className="paper-panel p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <Shield size={32} className="text-[#121212] shrink-0" />
                  <div>
                    <h2 className="text-2xl mb-1" style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
                      Clique Assignment Pending
                    </h2>
                    <p className="text-sm text-[#444]" style={{ fontFamily: "Special Elite, cursive" }}>
                      {myArchetype
                        ? "We map your starter deck archetype to a clique automatically."
                        : "Pick a starter deck first, then your clique assignment will happen automatically."}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  {!myArchetype ? (
                    <button
                      type="button"
                      onClick={() => navigate("/onboarding")}
                      className="tcg-button-primary px-5 py-2.5 text-sm"
                    >
                      Complete Onboarding
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={assigning}
                      onClick={retryAutoAssign}
                      className="tcg-button-primary px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {assigning ? (
                        <span className="inline-flex items-center gap-2">
                          <LoaderCircle size={14} className="animate-spin" /> Assigning...
                        </span>
                      ) : (
                        "Retry Assignment"
                      )}
                    </button>
                  )}
                </div>
              </motion.section>
            )}

            <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 mt-6">
              <motion.section variants={itemVariants} className="paper-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl" style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
                    Clique Roster
                  </h3>
                  <span className="text-xs uppercase text-[#666] tracking-wider">
                    {myClique ? myClique.name : "No Clique"}
                  </span>
                </div>

                {!myClique ? (
                  <p className="text-sm text-[#666]" style={{ fontFamily: "Special Elite, cursive" }}>
                    Once assigned, your first 12 members will show up here.
                  </p>
                ) : dashboard.myCliqueMembers.length === 0 ? (
                  <p className="text-sm text-[#666]" style={{ fontFamily: "Special Elite, cursive" }}>
                    No visible members yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dashboard.myCliqueMembers.map((member) => {
                      const displayName = member.username || member.name || "Unnamed player";
                      const role = formatRole(member.cliqueRole);
                      const roleTone =
                        role === "Founder"
                          ? "bg-[#ffcc00] text-[#121212]"
                          : role === "Leader"
                            ? "bg-[#121212] text-white"
                            : "bg-[#e8e8e8] text-[#333]";

                      return (
                        <div
                          key={member._id}
                          className="paper-panel-flat bg-white/90 px-3 py-2 flex items-center justify-between"
                        >
                          <p className="font-bold text-sm text-[#121212]">{displayName}</p>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 font-bold ${roleTone}`}>
                            {role}
                          </span>
                        </div>
                      );
                    })}

                    {dashboard.myCliqueMemberOverflow > 0 && (
                      <p className="text-xs uppercase tracking-wide text-[#666] mt-2">
                        +{dashboard.myCliqueMemberOverflow} more members
                      </p>
                    )}
                  </div>
                )}
              </motion.section>

              <motion.section variants={itemVariants} className="paper-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl" style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
                    School Standings
                  </h3>
                  <span className="text-xs uppercase text-[#666] tracking-wider">
                    {dashboard.totalPlayers} players
                  </span>
                </div>

                <div className="space-y-3">
                  {dashboard.leaderboard.map((clique, index) => {
                    const meta = getArchetypeMeta(clique.archetype);
                    const barWidth = Math.max(
                      8,
                      Math.round((clique.memberCount / Math.max(1, topMemberCount)) * 100),
                    );

                    return (
                      <div
                        key={clique._id}
                        className={`paper-panel-flat px-3 py-3 ${clique.isMyClique ? "ring-2 ring-[#ffcc00]" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-8 h-8 inline-flex items-center justify-center text-xs font-black border-2 border-[#121212]"
                              style={{ backgroundColor: clique.rank <= 3 ? "#ffcc00" : "#f5f5f5" }}
                            >
                              #{clique.rank}
                            </span>
                            <div>
                              <p className="font-black text-sm" style={{ color: meta.color }}>
                                {clique.name}
                              </p>
                              <p className="text-[11px] uppercase tracking-wide text-[#666]">
                                {meta.label}
                              </p>
                            </div>
                          </div>

                          <div className="text-right text-[11px] uppercase tracking-wide text-[#555]">
                            <div className="inline-flex items-center gap-1">
                              <Users size={12} /> {clique.memberCount}
                            </div>
                            <div className="inline-flex items-center gap-1 ml-3">
                              <Swords size={12} /> {clique.totalWins}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 h-2 bg-[#121212]/10 overflow-hidden">
                          <motion.div
                            className="h-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${barWidth}%` }}
                            transition={{ duration: 0.6, delay: 0.3 + index * 0.08, ease: "easeOut" }}
                            style={{ backgroundColor: meta.color }}
                          />
                        </div>

                        {clique.isMyClique && (
                          <p className="mt-2 text-[10px] uppercase tracking-wide font-bold text-[#121212] inline-flex items-center gap-1">
                            <Crown size={11} /> Your Clique
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            </div>
          </motion.div>
        )}
      </div>

      <TrayNav />
    </div>
  );
}

export default Cliques;

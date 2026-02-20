import { useState, useEffect, useRef } from "react";
import * as Sentry from "@sentry/react";
import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import {
  getLiveStreams,
  getRetakeConfig,
  streamUrl,
  type LiveStreamer,
} from "@/lib/retake";
import { LANDING_BG, MENU_TEXTURE, MILUNCHLADY_PFP } from "@/lib/blobUrls";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const LUNCHTABLE_AGENT = "milunchlady";
const RETAKE_CONFIG = getRetakeConfig();

function LiveBadge({ dotSize = "w-2 h-2" }: { dotSize?: string }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: "0.75em", height: "0.75em" }}>
      <span className={`relative z-10 ${dotSize} bg-white rounded-full animate-pulse`} />
      <span className="absolute w-full h-full rounded-full border border-white/60 animate-radar-ping" />
      <span className="absolute w-full h-full rounded-full border border-white/40 animate-radar-ping" style={{ animationDelay: "0.5s" }} />
    </span>
  );
}

function StreamCardReveal({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, inView, delay } = useScrollReveal({ index, threshold: 0.1 });
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
        transition: `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

export function Watch() {
  const [streams, setStreams] = useState<LiveStreamer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function fetchStreams() {
      try {
        const live = await getLiveStreams(RETAKE_CONFIG.apiUrl);
        if (mountedRef.current) {
          setStreams(live);
          setError(false);
        }
      } catch (err) {
        Sentry.captureException(err);
        if (mountedRef.current) setError(true);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchStreams();
    const interval = setInterval(fetchStreams, 30_000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // Separate our agent from others
  const list = Array.isArray(streams) ? streams : [];
  const ourAgent = list.find(
    (s) => s.username?.toLowerCase() === LUNCHTABLE_AGENT.toLowerCase(),
  );
  const otherStreams = list.filter(
    (s) => s.username?.toLowerCase() !== LUNCHTABLE_AGENT.toLowerCase(),
  );

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/75" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10 pb-24">
        {/* Header */}
        <div className="text-center mb-10">
          <motion.h1
            className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,1)] mb-2"
            style={{ fontFamily: "Outfit, sans-serif" }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Watch Live
          </motion.h1>
          <motion.p
            className="text-[#ffcc00] text-sm md:text-base"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            AI agents streaming LunchTable on retake.tv
          </motion.p>
        </div>

        {/* Featured: LunchLady */}
        <motion.section
          className="mb-12"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div
            className="relative overflow-hidden"
            style={{
              backgroundImage: `url('${MENU_TEXTURE}')`,
              backgroundSize: "512px",
            }}
          >
            <div className="absolute inset-0 bg-white/70 pointer-events-none" />

            <div className="relative flex flex-col md:flex-row items-center gap-6 p-6 md:p-8">
              {/* Agent avatar */}
              <div className="shrink-0 w-28 h-28 md:w-36 md:h-36 border-4 border-[#121212] bg-[#121212]/10 overflow-hidden">
                <img
                  src={MILUNCHLADY_PFP}
                  alt={LUNCHTABLE_AGENT}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                  <h2
                    className="text-2xl md:text-3xl font-black uppercase tracking-tight text-[#121212]"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {LUNCHTABLE_AGENT}
                  </h2>
                  {ourAgent ? (
                    <span
                      className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-black px-2.5 py-1 uppercase tracking-wider"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      <LiveBadge dotSize="w-2 h-2" />
                      Live
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 bg-[#121212]/20 text-[#121212]/60 text-xs font-black px-2.5 py-1 uppercase tracking-wider"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      Offline
                    </span>
                  )}
                </div>

                <p
                  className="text-sm text-[#121212]/60 mb-4"
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  The official LunchTable AI agent — plays, streams, and
                  trash-talks on retake.tv
                </p>

                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <a
                    href={streamUrl(LUNCHTABLE_AGENT)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#121212] text-white font-black uppercase tracking-wider text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,204,0,0.2)]"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    <span className="text-lg">&#9655;</span>
                    {ourAgent ? "Watch Now" : "Visit Channel"}
                  </a>

                  {ourAgent?.viewer_count != null && (
                    <span
                      className="text-sm text-[#121212]/50"
                      style={{ fontFamily: "Special Elite, cursive" }}
                    >
                      {ourAgent.viewer_count} watching
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8">
          <div className="flex-1 h-px bg-white/20" />
          <span
            className="text-white/40 text-xs uppercase tracking-widest"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Other Streams
          </span>
          <div className="flex-1 h-px bg-white/20" />
        </div>

        {/* Live streams grid */}
        {loading && list.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="text-white/30 text-sm animate-pulse"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Checking retake.tv for live streams...
            </div>
          </div>
        ) : error && list.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4 opacity-20">&#9888;</div>
            <p
              className="text-white/40 text-sm mb-4"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              retake.tv is migrating to Solana — streams will be back soon
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-[#ffcc00]/60 hover:text-[#ffcc00] text-xs uppercase tracking-wider transition-colors"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Retry
            </button>
          </div>
        ) : otherStreams.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4 opacity-20">&#128250;</div>
            <p
              className="text-white/50 text-sm mb-2"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              No other agents are streaming right now
            </p>
            <p
              className="text-white/30 text-xs"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Check back later or start your own agent stream
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherStreams.map((s, i) => (
              <StreamCardReveal key={s.user_id} index={i}>
                <a
                  href={streamUrl(s.username)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block overflow-hidden transition-all hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(255,204,0,0.15)]"
                  style={{
                    backgroundImage: `url('${MENU_TEXTURE}')`,
                    backgroundSize: "512px",
                  }}
                >
                  <div className="absolute inset-0 bg-white/70 group-hover:bg-white/80 pointer-events-none transition-colors" />

                  <div className="relative p-5">
                    <div className="flex items-center gap-3 mb-2">
                      {s.avatar_url ? (
                        <img
                          src={s.avatar_url}
                          alt={s.username}
                          className="w-10 h-10 border-2 border-[#121212] object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 border-2 border-[#121212] bg-[#121212]/10 flex items-center justify-center text-lg">
                          &#9881;
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-base font-black uppercase tracking-tight text-[#121212] truncate"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          {s.username}
                        </h3>
                      </div>
                      <span className="inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 uppercase">
                        <LiveBadge dotSize="w-1.5 h-1.5" />
                        Live
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#121212]/50">
                      {s.viewer_count != null && (
                        <span style={{ fontFamily: "Special Elite, cursive" }}>
                          {s.viewer_count} watching
                        </span>
                      )}
                      {s.ticker && (
                        <span
                          className="font-bold uppercase"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          ${s.ticker}
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              </StreamCardReveal>
            ))}
          </div>
        )}

        {/* Stream your agent CTA */}
        <div className="mt-16 text-center">
          <div className="w-16 h-px bg-white/10 mx-auto mb-8" />
          <p
            className="text-white/30 text-xs mb-3"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Got an ElizaOS agent? Stream it on retake.tv
          </p>
          <a
            href="https://retake.tv"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2.5 border border-white/20 text-white/60 hover:text-[#ffcc00] hover:border-[#ffcc00]/30 text-xs font-bold uppercase tracking-wider transition-all"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Start Streaming on retake.tv
          </a>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

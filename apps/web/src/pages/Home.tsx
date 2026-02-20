import { useCallback } from "react";
import { useNavigate } from "react-router";
import { usePrivy } from "@privy-io/react-auth";
import { motion } from "framer-motion";
import { useIframeMode } from "@/hooks/useIframeMode";
import { usePostLoginRedirect, storeRedirect } from "@/hooks/auth/usePostLoginRedirect";
import { TrayNav } from "@/components/layout/TrayNav";
import { PRIVY_ENABLED } from "@/lib/auth/privyEnv";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { useCardTilt } from "@/hooks/useCardTilt";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { SpeedLines } from "@/components/ui/SpeedLines";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";
import { ComicImpactText } from "@/components/ui/ComicImpactText";
import { StickerBadge } from "@/components/ui/StickerBadge";
import {
  INK_FRAME, LANDING_BG, DECO_PILLS, TITLE,
  STORY_BG, COLLECTION_BG, DECK_BG, WATCH_BG, TTG_BG, PVP_BG,
  TAPE, CIGGARETTE_TRAY,
} from "@/lib/blobUrls";

const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.4 } },
};

function Panel({
  title,
  subtitle,
  bgImage,
  bgContain,
  children,
  onClick,
  impactWord,
}: {
  title: string;
  subtitle: string;
  bgImage?: string;
  bgContain?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  impactWord?: string;
}) {
  const { tiltStyle, onMouseMove, onMouseLeave } = useCardTilt({ maxTilt: 6 });

  return (
    <div style={{ perspective: "800px" }}>
      <motion.button
        onClick={onClick}
        className="relative group flex flex-col justify-end cursor-pointer w-full h-full"
        variants={panelVariants}
        whileHover={{ scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{
          transform: `rotateX(${tiltStyle.rotateX}deg) rotateY(${tiltStyle.rotateY}deg)`,
          transformOrigin: "center center",
        }}
      >
        {/* Holographic gradient overlay — visible on hover */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,204,0,0.10) 0%, rgba(51,204,255,0.08) 40%, rgba(255,255,255,0.06) 60%, rgba(255,204,0,0.08) 100%)",
            mixBlendMode: "screen",
          }}
        />

        <img
          src={INK_FRAME}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
          draggable={false}
          loading="lazy"
        />
        {bgImage ? (
          <div
            className={`absolute inset-[6%] ${bgContain ? "bg-contain bg-no-repeat bg-center bg-[#fdfdfb]" : "bg-cover bg-center"} z-0`}
            style={{ backgroundImage: `url(${bgImage})` }}
          />
        ) : (
          <div className="absolute inset-[6%] bg-[#fdfdfb] z-0" />
        )}
        <div
          className="absolute inset-[6%] opacity-[0.03] pointer-events-none z-[1]"
          style={{
            backgroundImage: "radial-gradient(#121212 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        />
        {bgImage && (
          <div className="absolute inset-[6%] bg-gradient-to-t from-black/80 via-black/30 to-transparent z-[2]" />
        )}

        {/* Impact text on hover */}
        {impactWord && (
          <div className="absolute inset-0 z-[25] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <ComicImpactText text={impactWord} size="lg" color="#ffcc00" />
          </div>
        )}

        <div className="relative z-10 text-left p-[12%] pt-[20%] pl-[16%]">
          {children}
          <h2
            className={`text-2xl md:text-3xl leading-none mb-1 ${bgImage ? "text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]" : ""}`}
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {title}
          </h2>
          <p
            className={`text-xs md:text-sm leading-tight ${bgImage ? "text-white/80" : "text-[#666]"}`}
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            {subtitle}
          </p>
        </div>
      </motion.button>
    </div>
  );
}

export function Home() {
  const { isEmbedded } = useIframeMode();
  const navigate = useNavigate();
  const { authenticated, login } = PRIVY_ENABLED
    ? usePrivy()
    : { authenticated: false, login: () => { } };

  // After Privy login returns to Home, auto-navigate to the saved destination
  usePostLoginRedirect();

  const goTo = useCallback(
    (path: string, requiresAuth: boolean) => {
      if (requiresAuth && !authenticated) {
        storeRedirect(path);
        login();
        return;
      }
      navigate(path);
    },
    [authenticated, login, navigate],
  );

  return (
    <div
      className="min-h-dvh flex flex-col bg-cover bg-center bg-no-repeat relative overflow-x-hidden"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/50" />

      {/* Ambient floating ink particles */}
      <AmbientBackground variant="dark" />

      {/* Decorative pill bottle */}
      <motion.img
        src={DECO_PILLS}
        alt=""
        className="absolute bottom-16 left-2 md:left-6 h-32 md:h-48 w-auto opacity-20 pointer-events-none z-[15] select-none"
        draggable={false}
        loading="lazy"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Floating decorations — tape + cigarette tray scattered behind panels */}
      <DecorativeScatter
        elements={[
          { src: TAPE, size: 72, opacity: 0.12 },
          { src: CIGGARETTE_TRAY, size: 56, opacity: 0.10 },
          { src: TAPE, size: 64, opacity: 0.08 },
          { src: CIGGARETTE_TRAY, size: 48, opacity: 0.10 },
          { src: TAPE, size: 80, opacity: 0.09 },
        ]}
        seed={77}
        className="z-[5]"
      />

      {/* Header */}
      <header className="relative z-10 text-center pt-8 pb-4 px-4">
        {/* Speed lines behind the first panel area */}
        <div className="relative">
          <SpeedLines intensity={2} />
          {/* Dramatic bounce-drop entrance for title */}
          <motion.img
            src={TITLE}
            alt="LunchTable"
            className="relative z-10 h-16 md:h-24 mx-auto drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
            draggable={false}
            initial={{ opacity: 0, scale: 0, rotate: -3 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 350, damping: 15 }}
          />
        </div>
        {/* SpeechBubble subtitle */}
        <motion.div
          className="inline-block mt-2"
          initial={{ clipPath: "inset(0 100% 0 0)", opacity: 1 }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ clipPath: { delay: 0.25, duration: 0.55, ease: "easeOut" } }}
        >
          <SpeechBubble variant="wavy" tail="none" className="!max-w-none">
            <span
              className="text-base md:text-lg text-[#121212] drop-shadow-none"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              School of Hard Knocks
            </span>
          </SpeechBubble>
        </motion.div>
      </header>

      {/* Comic panels grid */}
      <motion.div
        className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 md:p-8 max-w-6xl w-full mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <Panel
          title="Story Mode"
          subtitle="Fight your way through the halls"
          bgImage={STORY_BG}
          onClick={() => goTo("/story", true)}
          impactWord="FIGHT!"
        >
          <div className="text-4xl mb-3 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">&#9876;</div>
        </Panel>

        <Panel
          title="Collection"
          subtitle="132 cards across 6 archetypes"
          bgImage={COLLECTION_BG}
          onClick={() => goTo("/collection", true)}
          impactWord="COLLECT!"
        >
          <div className="text-4xl mb-3 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">&#9830;</div>
        </Panel>

        <Panel
          title="Build Deck"
          subtitle="Stack your hand before the bell rings"
          bgImage={DECK_BG}
          onClick={() => goTo("/decks", true)}
          impactWord="BUILD!"
        >
          <div className="text-4xl mb-3 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">&#9998;</div>
        </Panel>

        <Panel
          title="Watch Live"
          subtitle="Agents streaming on retake.tv"
          bgImage={WATCH_BG}
          onClick={() => goTo("/watch", false)}
          impactWord="WATCH!"
        >
          <div className="text-4xl mb-3 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">&#9655;</div>
        </Panel>

        <Panel
          title="PvP Lobby"
          subtitle="Human duels + agent join invites"
          bgImage={PVP_BG}
          onClick={() => goTo("/pvp", true)}
          impactWord="DUEL!"
        >
          <div className="text-4xl mb-3 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">&#9878;</div>
        </Panel>

        <Panel
          title="LunchTable TTG"
          subtitle="Create worlds, agents, maps, and campaigns"
          bgImage={TTG_BG}
          bgContain
          onClick={() => goTo("/studio?tab=overview", false)}
          impactWord="CREATE!"
        >
          <div className="text-4xl mb-3">&#9881;</div>
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
            <StickerBadge label="COMING SOON" variant="stamp" pulse />
          </div>
        </Panel>
      </motion.div>

      {isEmbedded && (
        <p
          className="relative z-10 text-center text-xs text-white/40"
          style={{ paddingBottom: "calc(3.5rem + var(--safe-area-bottom))", fontFamily: "Special Elite, cursive" }}
        >
          Running inside milaidy
        </p>
      )}

      <TrayNav />
    </div>
  );
}

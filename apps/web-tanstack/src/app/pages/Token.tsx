import { useState } from "react";
import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { TITLE, VICE_SPLASH, VICE_COUNTER, MENU_TEXTURE, MILUNCHLADY_HYPEBEAST, viceImage } from "@/lib/blobUrls";
import { StickerBadge } from "@/components/ui/StickerBadge";
import { SpeedLines } from "@/components/ui/SpeedLines";
import { ComicImpactText } from "@/components/ui/ComicImpactText";

const SOLANA_TOKEN = "DfC2mRB5SNF1eCQZPh2cGi5QhNQnm3jRNHwa5Rtkpump";

const vices = [
  {
    name: "Gambling",
    slug: "gambling",
    desc: "Can't stop betting — doubles down even when losing",
    gameInfo: "Gain +500 Rep but enter a coin flip breakdown check immediately. Tails means instant destruction.",
    rotation: -4,
  },
  {
    name: "Alcohol",
    slug: "alcohol",
    desc: "Party lifestyle that spirals out of control",
    gameInfo: "Draw 2 cards, but your Stability drops by 200 every turn until this card breaks down.",
    rotation: 3,
  },
  {
    name: "Social Media",
    slug: "social-media",
    desc: "Addicted to likes, shares, and online validation",
    gameInfo: "Protects adjacent cards from effects, but accumulates 1 vice counter for every spell played.",
    rotation: -1,
  },
  {
    name: "Crypto",
    slug: "crypto",
    desc: "All-in on digital assets, blind to risk",
    gameInfo: "Rep doubles every standby phase, but becomes 0 if your opponent controls more monsters.",
    rotation: -5,
  },
  {
    name: "Validation",
    slug: "validation",
    desc: "Desperate need for approval and recognition",
    gameInfo: "Requires a 'Compliment' effect to unlock attack. Gains +1000 Rep when targeted by your own spells.",
    rotation: 2,
  },
  {
    name: "Conspiracy",
    slug: "conspiracy",
    desc: "Lost in paranoid theories, disconnected from reality",
    gameInfo: "Your opponent must play with their hand revealed. Automatically destroys itself if targeted by a secret.",
    rotation: -2,
  },
  {
    name: "Narcissism",
    slug: "narcissism",
    desc: "Self-obsession that alienates everyone",
    gameInfo: "Absorbs Rep from all other monsters on your field. Destroyed if any other monster you control is destroyed.",
    rotation: 4,
  },
  {
    name: "Adderall",
    slug: "adderall",
    desc: "Stimulant dependency, burnout from hyperfocus",
    gameInfo: "Allows 2 extra Normal Summons this turn. Becomes unusable and gains 2 vice counters next turn.",
    rotation: -3,
  },
  {
    name: "MLM",
    slug: "mlm",
    desc: "Multi-level marketing delusion, hustle culture",
    gameInfo: "On summon, place 1 vice counter on all opponent monsters. Gains power for every counter on the board.",
    rotation: 1,
  },
  {
    name: "Rage",
    slug: "rage",
    desc: "Uncontrolled anger that destroys relationships",
    gameInfo: "Highest Rep in its class, but MUST attack the strongest monster your opponent controls every turn.",
    rotation: -4,
  },
];

function ViceCardReveal({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, inView, delay } = useScrollReveal({ index, threshold: 0.1 });
  return (
    <div
      ref={ref}
      className="vice-card-wrapper"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0) scale(1)" : "translateY(20px) scale(0.9)",
        transition: `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

export function Token() {
  const [flippedSlug, setFlippedSlug] = useState<string | null>(null);

  return (
    <div
      className="min-h-screen relative bg-fixed bg-center bg-cover"
      style={{
        backgroundImage: `url('${VICE_SPLASH}')`,
      }}
    >
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-[#121212]/80 backdrop-blur-[2px]" />
      {/* Header */}
      <div className="relative z-10 pt-8 pb-4 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.img
            src={TITLE}
            alt="LunchTable"
            className="h-12 md:h-16 mx-auto mb-2 drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
            draggable={false}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          />
          <p
            className="text-[#ffcc00] text-sm mb-6"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            $LUNCH on Solana
          </p>

          {/* Token address */}
          <a
            href={`https://pump.fun/${SOLANA_TOKEN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-4 py-2 bg-[#121212] text-white/70 hover:text-[#ffcc00] text-xs font-mono transition-colors border border-white/10 hover:border-[#ffcc00]/30 break-all max-w-md"
          >
            {SOLANA_TOKEN}
          </a>
        </div>
      </div>

      {/* Vice counter icon with speed lines */}
      <div className="relative z-10 flex justify-center py-6">
        <div className="relative">
          <SpeedLines intensity={1} />
          <img
            src={VICE_COUNTER}
            alt="Vice Counter"
            className="h-20 md:h-28 w-auto opacity-60 invert relative z-10"
            draggable={false}
          />
        </div>
      </div>

      {/* Section title */}
      <div className="relative z-10 text-center mb-12 px-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-center gap-4 mb-2">
          <motion.h2
            className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-[#ffcc00] drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]"
            style={{ fontFamily: "Outfit, sans-serif" }}
            initial={{ opacity: 0, scale: 1.5, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            The 10 Vices
          </motion.h2>
          <StickerBadge label="VICE" variant="stamp" rotation={-4} />
        </div>

        {/* Static decorative impact text */}
        <div className="mb-3">
          <ComicImpactText text="DANGEROUS" size="md" color="#ef4444" rotation={-6} />
        </div>

        <p
          className="text-white/70 text-base md:text-lg"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Every character has a flaw. Push them too hard and they crack.
        </p>
      </div>

      {/* Vice cards */}
      <div className="relative z-10 flex flex-wrap justify-center items-center gap-8 px-4 pb-16 max-w-7xl mx-auto vice-card-container">
        {vices.map((vice, i) => (
          <ViceCardReveal key={vice.slug} index={i}>
            <div
              className={`vice-card ${flippedSlug === vice.slug ? "flipped" : ""}`}
              style={{ "--rotation": `${vice.rotation}deg` } as React.CSSProperties}
              onClick={() => setFlippedSlug(flippedSlug === vice.slug ? null : vice.slug)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setFlippedSlug(flippedSlug === vice.slug ? null : vice.slug);
                }
              }}
              tabIndex={0}
            >
              {/* Front side (Comic Strip) */}
              <div className="vice-card-face vice-card-front">
                <img
                  src={viceImage(vice.slug)}
                  alt={vice.name}
                  className="w-full h-full"
                  style={{ objectFit: "fill", borderRadius: "35px" }}
                  draggable={false}
                />
              </div>

              {/* Back side (Game Info) */}
              <div
                className="vice-card-face vice-card-back relative"
                style={{
                  backgroundImage: `url('${MENU_TEXTURE}')`,
                  backgroundSize: "256px 256px",
                }}
              >
                {/* Dimming overlay */}
                <div className="absolute inset-0 bg-white/90" />

                <div className="relative z-10 w-full h-full p-3 md:p-6 flex flex-col items-center justify-center text-center">
                  <h3
                    className="text-xl md:text-3xl font-black uppercase tracking-tight text-[#121212] mb-4 transform -rotate-2"
                    style={{ fontFamily: "Permanent Marker, cursive" }}
                  >
                    {vice.name}
                  </h3>

                  <div className="w-full h-0.5 bg-[#121212] mb-3 md:mb-6 transform rotate-1" />

                  <p
                    className="text-sm md:text-lg text-[#121212] mb-4 md:mb-8 font-bold leading-tight transform rotate-1"
                    style={{ fontFamily: "Permanent Marker, cursive" }}
                  >
                    "{vice.desc}"
                  </p>

                  <div className="bg-[#f0f0f0] p-2 md:p-4 border-2 border-[#121212] transform -rotate-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full">
                    <p
                      className="text-xs md:text-base text-[#121212] leading-snug uppercase font-bold"
                      style={{ fontFamily: "Permanent Marker, cursive" }}
                    >
                      <span className="text-[#ff4444] block mb-1">
                        EFFECT:
                      </span>
                      {vice.gameInfo}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ViceCardReveal>
        ))}
      </div>

      {/* Character insert decoration */}
      <div className="absolute bottom-24 right-4 z-[5] pointer-events-none hidden md:block">
        <img
          src={MILUNCHLADY_HYPEBEAST}
          alt=""
          className="h-32 w-auto opacity-40"
          draggable={false}
        />
      </div>

      {/* Bottom info */}
      <div className="relative z-10 text-center pb-20 px-4">
        <p
          className="text-white/30 text-xs mb-4"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Breakdown threshold: 3 vice counters. Cause 3 breakdowns to win.
        </p>
        <a
          href={`https://pump.fun/${SOLANA_TOKEN}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-[#ffcc00] text-[#121212] font-black uppercase tracking-wider text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(255,204,0,0.3)]"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Buy $LUNCH
        </a>
      </div>

      <TrayNav />
    </div>
  );
}

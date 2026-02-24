import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { ComicImpactText } from "@/components/ui/ComicImpactText";
import { StickerBadge } from "@/components/ui/StickerBadge";
import { SpeedLines } from "@/components/ui/SpeedLines";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";
import {
  ABOUT_1_CONCEPT,
  ABOUT_2_CARDS,
  ABOUT_3_STREAM,
  ABOUT_4_PLATFORM,
  LANDING_BG,
  MENU_TEXTURE,
  TITLE,
  TAPE,
  MILUNCHLADY_CLASSIC,
  MILUNCHLADY_GOTH,
} from "@/lib/blobUrls";

function RevealPanel({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, inView, delay } = useScrollReveal({ index, threshold: 0.15 });
  return (
    <div
      ref={ref}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

export function About() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (bgRef.current) {
          bgRef.current.style.transform = `translateY(${window.scrollY * 0.3}px)`;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const comics = [
    {
      img: ABOUT_1_CONCEPT,
      caption: "HUMANS vs AI. THE CAFETERIA IS THE BATTLEGROUND.",
    },
    {
      img: ABOUT_2_CARDS,
      caption: "132 CARDS. 6 ARCHETYPES. CHOOSE YOUR CLIQUE.",
    },
    {
      img: ABOUT_3_STREAM,
      caption: "LIVE 24/7. WATCH AGENTS TRASH-TALK IN REAL TIME.",
    },
    {
      img: ABOUT_4_PLATFORM,
      caption: "CROSS-PLATFORM. PLAY ANYWHERE. NO EXCUSES.",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div
        ref={bgRef}
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${LANDING_BG}')` }}
      />
      <div className="absolute inset-0 bg-black/80" />

      {/* Decorative tape scatter across the page */}
      <DecorativeScatter
        elements={[
          { src: TAPE, size: 80, opacity: 0.08 },
          { src: TAPE, size: 64, opacity: 0.06 },
          { src: TAPE, size: 72, opacity: 0.07 },
          { src: TAPE, size: 56, opacity: 0.09 },
          { src: TAPE, size: 68, opacity: 0.05 },
        ]}
        seed={55}
        className="z-[1]"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 pb-32">
        {/* Title section with speed lines */}
        <div className="relative text-center mb-8">
          <SpeedLines intensity={1} />
          <motion.img
            src={TITLE}
            alt="LunchTable"
            className="relative z-10 h-16 md:h-24 mx-auto mb-4"
            draggable={false}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          />
          <motion.p
            className="relative z-10 text-lg md:text-xl text-white/60"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            School of Hard Knocks
          </motion.p>
        </div>

        {/* ComicImpactText section header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 15 }}
        >
          <ComicImpactText
            text="HUMANS VS AI"
            size="lg"
            color="#ffcc00"
            rotation={-3}
            animate
          />
        </motion.div>

        <div className="space-y-12">
          {comics.map((panel, i) => (
            <div key={i}>
              <RevealPanel index={i}>
                <div className="relative group mx-auto max-w-2xl">
                  <div
                    className="relative p-2 bg-[#121212] border-2 border-[#2a2a2a] shadow-2xl transform rotate-1 group-hover:rotate-0 transition-transform duration-500"
                    style={{
                      backgroundImage: `url('${MENU_TEXTURE}')`,
                      backgroundSize: "256px",
                    }}
                  >
                    <img
                      src={panel.img}
                      alt={panel.caption}
                      className="w-full h-auto border border-black/50 grayscale-[0.2] group-hover:grayscale-0 transition-all duration-500"
                      draggable={false}
                    />

                    {/* SpeechBubble caption replacing flat div */}
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-10 transform -rotate-1 group-hover:rotate-0 transition-transform duration-500">
                      <SpeechBubble variant="speech" tail="none">
                        <p
                          className="text-sm md:text-base font-bold text-[#121212] uppercase tracking-widest text-center"
                          style={{ fontFamily: "Special Elite, cursive" }}
                        >
                          {panel.caption}
                        </p>
                      </SpeechBubble>
                    </div>
                  </div>
                </div>
              </RevealPanel>

              {/* Character insert after panel 1 (index 0) */}
              {i === 0 && (
                <motion.div
                  className="flex justify-center mt-10 mb-2"
                  initial={{ opacity: 0, rotate: -8, scale: 0.8 }}
                  whileInView={{ opacity: 1, rotate: 5, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <img
                    src={MILUNCHLADY_CLASSIC}
                    alt="MiLunchLady Classic"
                    className="h-20 w-auto drop-shadow-[3px_3px_0px_rgba(0,0,0,0.6)] select-none"
                    draggable={false}
                    style={{ transform: "rotate(5deg)" }}
                  />
                </motion.div>
              )}

              {/* Character insert after panel 3 (index 2) */}
              {i === 2 && (
                <motion.div
                  className="flex justify-center mt-10 mb-2"
                  initial={{ opacity: 0, rotate: 8, scale: 0.8 }}
                  whileInView={{ opacity: 1, rotate: -4, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <img
                    src={MILUNCHLADY_GOTH}
                    alt="MiLunchLady Goth"
                    className="h-20 w-auto drop-shadow-[3px_3px_0px_rgba(0,0,0,0.6)] select-none"
                    draggable={false}
                    style={{ transform: "rotate(-4deg)" }}
                  />
                </motion.div>
              )}
            </div>
          ))}
        </div>

        {/* CTA bottom section — JOIN THE FIGHT */}
        <motion.div
          className="mt-24 text-center"
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-6">
            <ComicImpactText
              text="JOIN THE FIGHT"
              size="lg"
              color="#ffcc00"
              rotation={-2}
              animate
            />
          </div>
          <div className="flex justify-center">
            <SpeechBubble variant="burst" tail="none">
              <span
                className="text-base md:text-lg font-bold text-[#121212]"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                Play now. It's free. It's chaotic.
              </span>
            </SpeechBubble>
          </div>
        </motion.div>

        {/* Footer Build Info — StickerBadge tech tags */}
        <div className="mt-20 text-center">
          <div className="flex flex-wrap justify-center gap-3">
            {["LTCG Platform", "ElizaOS", "Convex", "retake.tv", "milaidy"].map(
              (tag) => (
                <StickerBadge key={tag} label={tag} variant="tag" />
              ),
            )}
          </div>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

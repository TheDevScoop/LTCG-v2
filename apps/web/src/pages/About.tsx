import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import {
  ABOUT_1_CONCEPT,
  ABOUT_2_CARDS,
  ABOUT_3_STREAM,
  ABOUT_4_PLATFORM,
  LANDING_BG,
  MENU_TEXTURE,
  TITLE,
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

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 pb-32">
        <div className="text-center mb-12">
          <motion.img
            src={TITLE}
            alt="LunchTable"
            className="h-16 md:h-24 mx-auto mb-4"
            draggable={false}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          />
          <motion.p
            className="text-lg md:text-xl text-white/60"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            School of Hard Knocks
          </motion.p>
        </div>

        <div className="space-y-12">
          {comics.map((panel, i) => (
            <RevealPanel key={i} index={i}>
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

                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[90%] bg-black border border-[#333] p-3 text-center shadow-lg transform -rotate-1 group-hover:rotate-0 transition-transform duration-500">
                    <p
                      className="text-sm md:text-base font-bold text-[#e0e0e0] uppercase tracking-widest"
                      style={{ fontFamily: "Special Elite, cursive" }}
                    >
                      {panel.caption}
                    </p>
                  </div>
                </div>
              </div>
            </RevealPanel>
          ))}
        </div>

        {/* Footer Build Info */}
        <div className="mt-32 text-center">
          <div className="flex flex-wrap justify-center gap-2 opacity-50">
            {["LTCG Platform", "ElizaOS", "Convex", "retake.tv", "milaidy"].map(
              (tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider border border-white/20 text-white/40"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {tag}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

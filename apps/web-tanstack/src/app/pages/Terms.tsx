import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import { LANDING_BG, MENU_TEXTURE, TAPE, DECO_PILLS } from "@/lib/blobUrls";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";

const SCATTER_ELEMENTS = [
  { src: TAPE, size: 48, opacity: 0.12 },
  { src: DECO_PILLS, size: 36, opacity: 0.1 },
  { src: TAPE, size: 40, opacity: 0.11 },
];

export function Terms() {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12 pb-20">
        <div
          className="relative p-6 md:p-12"
          style={{
            backgroundImage: `url('${MENU_TEXTURE}')`,
            backgroundSize: "512px",
            backgroundRepeat: "repeat",
          }}
        >
          <div className="absolute inset-0 bg-white/60 pointer-events-none" />

          {/* Decorative scatter in margins */}
          <DecorativeScatter elements={SCATTER_ELEMENTS} density={3} seed={66} />

          {/* Margin thought bubbles */}
          <div className="absolute -right-2 top-20 hidden lg:block z-20" style={{ transform: "rotate(-2deg)" }}>
            <SpeechBubble variant="thought" tail="none" className="!max-w-[150px]">
              <span className="text-xs">rules are rules</span>
            </SpeechBubble>
          </div>
          <div className="absolute -right-4 top-[50%] hidden lg:block z-20" style={{ transform: "rotate(3deg)" }}>
            <SpeechBubble variant="thought" tail="none" className="!max-w-[140px]">
              <span className="text-xs">don't be a jerk</span>
            </SpeechBubble>
          </div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <motion.h1
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-[#121212] mb-6"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Terms of Service
            </motion.h1>

            <div
              className="space-y-4 text-[#121212]/80 text-sm md:text-base leading-relaxed"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              <p
                className="text-xs text-[#121212]/50"
                style={{ fontFamily: "Special Elite, cursive" }}
              >
                Last updated: February 2026
              </p>

              <h2 className="text-lg font-bold text-[#121212] mt-6" style={{ fontFamily: "Outfit, sans-serif" }}>
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or playing LunchTable: School of Hard Knocks, you agree to be bound by these Terms of
                Service. If you do not agree, do not use the service.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                2. The Game
              </h2>
              <p>
                LunchTable is a trading card game operated as a white-label instance of the LTCG platform. The game
                features 132 cards across 6 archetypes and supports both human and AI agent players. Game mechanics,
                card stats, and balance are subject to change without notice.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                3. Accounts
              </h2>
              <p>
                You are responsible for maintaining the security of your account. One account per person. Accounts
                created through Privy authentication are subject to Privy's terms of service. Sharing accounts or using
                automated tools to gain unfair advantage is prohibited.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                4. AI Agents
              </h2>
              <p>
                ElizaOS agents participate in the game as autonomous players. Agents may stream their gameplay via
                retake.tv. By playing against agents, you acknowledge that your game state and username may appear in
                public streams.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                5. Digital Assets
              </h2>
              <p>
                Cards, decks, and other in-game items are digital assets within the LunchTable ecosystem. They hold no
                monetary value outside the game unless explicitly stated. We reserve the right to modify, rebalance, or
                remove any digital asset.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                6. Conduct
              </h2>
              <p>
                Players must not exploit bugs, manipulate matchmaking, harass other players, or interfere with gameplay
                systems. Violations may result in temporary or permanent account suspension.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                7. Streaming & Content
              </h2>
              <p>
                Matches may be streamed or recorded. By participating, you grant LunchTable a non-exclusive license to
                display your username, game actions, and match results in streams and promotional materials.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                8. Limitation of Liability
              </h2>
              <p>
                LunchTable is provided "as is" without warranties of any kind. We are not liable for any loss of game
                data, interruptions of service, or actions taken by AI agents during gameplay.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                9. Changes
              </h2>
              <p>
                We may update these terms at any time. Continued use of the service after changes constitutes acceptance
                of the revised terms.
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

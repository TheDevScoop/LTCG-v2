import { motion } from "framer-motion";
import { TrayNav } from "@/components/layout/TrayNav";
import { PRIVACY_BG, MENU_TEXTURE, TAPE } from "@/lib/blobUrls";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";

const SCATTER_ELEMENTS = [
  { src: TAPE, size: 48, opacity: 0.12 },
  { src: TAPE, size: 40, opacity: 0.1 },
  { src: TAPE, size: 44, opacity: 0.11 },
];

export function Privacy() {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: `url('${PRIVACY_BG}')` }}
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
          <DecorativeScatter elements={SCATTER_ELEMENTS} density={3} seed={55} />

          {/* Margin thought bubbles */}
          <div className="absolute -right-2 top-24 hidden lg:block z-20" style={{ transform: "rotate(3deg)" }}>
            <SpeechBubble variant="thought" tail="none" className="!max-w-[160px]">
              <span className="text-xs">boring but important!</span>
            </SpeechBubble>
          </div>
          <div className="absolute -right-4 top-[55%] hidden lg:block z-20" style={{ transform: "rotate(-2deg)" }}>
            <SpeechBubble variant="thought" tail="none" className="!max-w-[150px]">
              <span className="text-xs">lawyers made us write this</span>
            </SpeechBubble>
          </div>
          <div className="absolute -right-2 bottom-32 hidden lg:block z-20" style={{ transform: "rotate(1deg)" }}>
            <SpeechBubble variant="thought" tail="none" className="!max-w-[140px]">
              <span className="text-xs">we promise we're cool</span>
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
              Privacy Policy
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
                1. Information We Collect
              </h2>
              <p>
                When you create an account with LunchTable: School of Hard Knocks, we collect your email address and
                authentication credentials through our provider, Privy. If you connect a wallet, we store your public
                wallet address. We do not store private keys.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                2. How We Use Your Information
              </h2>
              <p>
                We use your information to provide and maintain the game service, manage your account and deck
                collections, facilitate matches between players and AI agents, display leaderboard standings, and
                communicate service updates.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                3. Third-Party Services
              </h2>
              <p>
                LunchTable integrates with third-party services including Privy for authentication, Convex for real-time
                data, and retake.tv for gameplay streaming. Each service operates under its own privacy policy.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                4. AI Agent Interactions
              </h2>
              <p>
                Matches played against or alongside ElizaOS agents are processed in real-time. Agent gameplay decisions
                may be streamed publicly via retake.tv. Your username and game state are visible during streamed matches.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                5. Embedded Environment
              </h2>
              <p>
                When accessed through the milaidy desktop application, authentication tokens are exchanged via
                postMessage protocol between the host app and LunchTable. No additional data is collected beyond what is
                described above.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                6. Data Retention
              </h2>
              <p>
                Game data including match history, deck configurations, and collection progress is retained as long as
                your account is active. You may request deletion of your account and associated data at any time.
              </p>

              <div className="torn-paper-edge h-4 bg-[#121212]/5 my-4" />

              <h2 className="text-lg font-bold text-[#121212]" style={{ fontFamily: "Outfit, sans-serif" }}>
                7. Contact
              </h2>
              <p>
                For privacy-related inquiries, reach out to us through the channels listed on our About page.
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}

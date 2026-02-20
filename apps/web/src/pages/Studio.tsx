import { motion } from "framer-motion";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { LANDING_BG } from "@/lib/blobUrls";
import { TrayNav } from "@/components/layout/TrayNav";

export function Studio() {
  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/80" />
      <AmbientBackground variant="dark" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 pb-24">
        <motion.h1
          className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)] mb-4 animate-ink-stamp"
          style={{ fontFamily: "Outfit, sans-serif" }}
          initial={{ opacity: 0, scale: 2, rotate: -8 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        >
          STUDIO
        </motion.h1>

        <motion.p
          className="text-[#ffcc00] text-lg md:text-xl text-center max-w-md"
          style={{ fontFamily: "Special Elite, cursive" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Card creation tools are coming soon.
        </motion.p>

        <motion.p
          className="text-white/30 text-xs mt-6 uppercase tracking-widest"
          style={{ fontFamily: "Outfit, sans-serif" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          Design your own cards. Build your own decks. Break the meta.
        </motion.p>
      </div>

      <TrayNav />
    </div>
  );
}

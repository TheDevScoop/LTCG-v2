import { motion } from "framer-motion";
import { LOGO } from "@/lib/blobUrls";

interface BrandedLoaderProps {
  variant?: "dark" | "light";
  message?: string;
}

export function BrandedLoader({ variant = "dark", message }: BrandedLoaderProps) {
  const bg = variant === "dark" ? "bg-[#1a1816]" : "bg-[#fdfdfb]";
  const textColor = variant === "dark" ? "text-[#ffcc00]" : "text-[#121212]";

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${bg} gap-4`}>
      <motion.img
        src={LOGO}
        alt="Loading"
        className={`h-16 w-16 ${variant === "dark" ? "" : "invert"}`}
        draggable={false}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.p
        className={`text-sm uppercase tracking-wider font-bold ${textColor}`}
        style={{ fontFamily: "Special Elite, cursive" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {message || "Loading..."}
      </motion.p>
    </div>
  );
}

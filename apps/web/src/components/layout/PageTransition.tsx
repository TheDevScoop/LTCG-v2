import { motion, type Variants } from "framer-motion";

export type TransitionVariant = "fade" | "wipe" | "ink-splash";

const fadeVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.99, y: -6 },
};

const wipeVariants: Variants = {
  initial: { clipPath: "inset(0 100% 0 0)", opacity: 0 },
  animate: { clipPath: "inset(0 0% 0 0)", opacity: 1 },
  exit: { clipPath: "inset(0 0 0 100%)", opacity: 0 },
};

const inkSplashVariants: Variants = {
  initial: { clipPath: "circle(0% at 50% 50%)", opacity: 0 },
  animate: { clipPath: "circle(150% at 50% 50%)", opacity: 1 },
  exit: { clipPath: "circle(0% at 50% 50%)", opacity: 0 },
};

const variantMap: Record<TransitionVariant, Variants> = {
  fade: fadeVariants,
  wipe: wipeVariants,
  "ink-splash": inkSplashVariants,
};

const transitionConfig: Record<TransitionVariant, object> = {
  fade: { duration: 0.35, ease: "easeOut" },
  wipe: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  "ink-splash": { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
};

export function PageTransition({
  children,
  variant = "fade",
}: {
  children: React.ReactNode;
  variant?: TransitionVariant;
}) {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fall back to simple fade for reduced motion
  const v = prefersReduced ? "fade" : variant;
  const variants = variantMap[v];
  const transition = prefersReduced
    ? { duration: 0.15 }
    : transitionConfig[v];

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

export function FastPageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  );
}

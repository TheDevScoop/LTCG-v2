const TIER_COLORS: Record<string, string> = {
  bronze: "#CD7F32",
  silver: "#C0C0C0",
  gold: "#FFD700",
  platinum: "#E5E4E2",
  diamond: "#B9F2FF",
};

const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;

function DiamondIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M8 1L15 8L8 15L1 8L8 1Z"
        fill={color}
        stroke="#121212"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ShieldIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M8 1L1 4V10C1 14 4 17.5 8 19C12 17.5 15 14 15 10V4L8 1Z"
        fill={color}
        stroke="#121212"
        strokeWidth="1.5"
      />
    </svg>
  );
}

type TierBadgeProps = {
  tier: string;
  size?: "sm" | "md" | "lg";
};

export function TierBadge({ tier, size = "md" }: TierBadgeProps) {
  const normalizedTier = TIER_ORDER.includes(tier as (typeof TIER_ORDER)[number])
    ? tier
    : "bronze";
  const color = TIER_COLORS[normalizedTier] ?? TIER_COLORS.bronze;

  const sizeMap = {
    sm: { icon: 12, text: "text-[10px]", px: "px-1.5", py: "py-0.5", gap: "gap-1" },
    md: { icon: 16, text: "text-xs", px: "px-2", py: "py-1", gap: "gap-1.5" },
    lg: { icon: 20, text: "text-sm", px: "px-3", py: "py-1.5", gap: "gap-2" },
  };

  const s = sizeMap[size];
  const Icon = normalizedTier === "diamond" ? DiamondIcon : ShieldIcon;

  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.px} ${s.py} font-black uppercase tracking-wider border-2 border-[#121212]`}
      style={{
        fontFamily: "Outfit, sans-serif",
        backgroundColor: color,
        color: normalizedTier === "platinum" || normalizedTier === "diamond" ? "#121212" : "#fff",
        textShadow:
          normalizedTier === "platinum" || normalizedTier === "diamond"
            ? "none"
            : "1px 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      <Icon color={color ?? "#CD7F32"} size={s.icon} />
      <span className={s.text}>{normalizedTier}</span>
    </span>
  );
}

export { TIER_COLORS, TIER_ORDER };

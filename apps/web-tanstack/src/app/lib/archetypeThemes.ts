export interface ArchetypeTheme {
  gradient: string;
  icon: string;
  iconPath: string;
  color: string;
  borderColor: string;
  glowColor: string;
}

export const ARCHETYPE_THEMES: Record<string, ArchetypeTheme> = {
  dropout: {
    gradient: "from-red-600 via-red-500 to-orange-500",
    icon: "🔥",
    iconPath: "/brand/icons/archetypes/dropout.png",
    color: "red",
    borderColor: "border-red-500/50",
    glowColor: "shadow-red-500/30",
  },
  prep: {
    gradient: "from-blue-600 via-blue-500 to-cyan-500",
    icon: "🎉",
    iconPath: "/brand/icons/archetypes/prep.png",
    color: "blue",
    borderColor: "border-blue-500/50",
    glowColor: "shadow-blue-500/30",
  },
  geek: {
    gradient: "from-yellow-600 via-yellow-500 to-amber-400",
    icon: "🧠",
    iconPath: "/brand/icons/archetypes/geek.png",
    color: "yellow",
    borderColor: "border-yellow-500/50",
    glowColor: "shadow-yellow-500/30",
  },
  freak: {
    gradient: "from-purple-600 via-purple-500 to-fuchsia-500",
    icon: "🧪",
    iconPath: "/brand/icons/archetypes/freak.png",
    color: "purple",
    borderColor: "border-purple-500/50",
    glowColor: "shadow-purple-500/30",
  },
  nerd: {
    gradient: "from-green-700 via-green-500 to-emerald-400",
    icon: "📐",
    iconPath: "/brand/icons/archetypes/nerd.png",
    color: "green",
    borderColor: "border-green-500/50",
    glowColor: "shadow-green-500/30",
  },
  goodie_two_shoes: {
    gradient: "from-gray-300 via-gray-200 to-white",
    icon: "🙏",
    iconPath: "/brand/icons/archetypes/goodie_two_shoes.png",
    color: "gray",
    borderColor: "border-gray-400/50",
    glowColor: "shadow-gray-400/30",
  },
};

export const DEFAULT_ARCHETYPE_THEME: ArchetypeTheme = {
  gradient: "from-purple-600 via-indigo-500 to-blue-500",
  icon: "🎴",
  iconPath: "/brand/icons/archetypes/freak.png",
  color: "purple",
  borderColor: "border-purple-500/50",
  glowColor: "shadow-purple-500/30",
};

const ARCHETYPE_ALIASES: Record<string, string> = {
  dropout: "dropout",
  dropouts: "dropout",
  prep: "prep",
  preps: "prep",
  geek: "geek",
  geeks: "geek",
  freak: "freak",
  freaks: "freak",
  nerd: "nerd",
  nerds: "nerd",
  goodie: "goodie_two_shoes",
  goodies: "goodie_two_shoes",
  goodie_two_shoes: "goodie_two_shoes",
  goodietwoshoes: "goodie_two_shoes",
};

function normalizeArchetypeKey(archetype: string) {
  const raw = archetype.trim().toLowerCase().replace(/\s+/g, "_");
  return ARCHETYPE_ALIASES[raw] ?? raw;
}

export function getArchetypeTheme(archetype: string | undefined): ArchetypeTheme {
  if (!archetype) return DEFAULT_ARCHETYPE_THEME;
  return ARCHETYPE_THEMES[normalizeArchetypeKey(archetype)] ?? DEFAULT_ARCHETYPE_THEME;
}

export function getArchetypeTextColor(archetype: string | undefined) {
  const theme = getArchetypeTheme(archetype);
  return `text-${theme.color}-400`;
}

export function getArchetypeBgColor(archetype: string | undefined) {
  const theme = getArchetypeTheme(archetype);
  return `bg-${theme.color}-500/20`;
}

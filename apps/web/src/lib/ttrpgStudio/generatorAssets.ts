import type { PromptTemplate, WorldCreationKit } from "./types";

interface BuildKitInput {
  worldName: string;
  genre: string;
  mood: string;
  uniqueConstraint: string;
  assetManifest: WorldCreationKit["assetManifest"];
  sessionZeroChecklist: string[];
  playtestMatrix: WorldCreationKit["playtestMatrix"];
}

const BASE_PROMPTS: PromptTemplate[] = [
  {
    id: "world-bible",
    name: "World Bible Generator",
    purpose: "Create coherent setting canon for GM and player agents.",
    inputSchema: ["world_name", "genre", "tone", "themes", "factions", "tech_or_magic_level"],
    template:
      "Generate a world bible for {{world_name}} in genre {{genre}} with tone {{tone}}. " +
      "Include 6 factions, 12 location hooks, 8 rumors, and one d12 random encounter table.",
    outputChecklist: [
      "Faction goals and rivalries are explicit",
      "Every location has one conflict and one reward",
      "Hooks can be resolved in under 90 minutes",
    ],
  },
  {
    id: "session-arc",
    name: "Session Arc Generator",
    purpose: "Generate a 3-scene session with fail-forward branches.",
    inputSchema: ["party_level", "party_size", "goal", "world_constraint"],
    template:
      "Produce a 3-scene session arc for {{world_name}}. Respect constraint: {{world_constraint}}. " +
      "For each scene, provide objective, obstacle, soft fail state, and hard fail state.",
    outputChecklist: [
      "At least one social and one tactical scene",
      "Fail states progress story instead of dead-ending",
      "Includes one reveal worth clipping for social media",
    ],
  },
  {
    id: "encounter-crafter",
    name: "Encounter Crafter",
    purpose: "Build balanced encounters for humans and AI agents.",
    inputSchema: ["party_profile", "threat_budget", "environment", "stakes"],
    template:
      "Craft encounter cards for {{world_name}} with threat budget {{threat_budget}} in {{environment}}. " +
      "Return enemy roles, tactics, trigger lines for narrator, and retreat conditions.",
    outputChecklist: [
      "Each enemy has a readable role",
      "Narrator lines fit in 120 characters",
      "Retreat/fallback state is present",
    ],
  },
  {
    id: "character-sheet",
    name: "Character Build Generator",
    purpose: "Generate playable character sheets and voice goals.",
    inputSchema: ["archetype", "player_style", "campaign_arc", "risk_tolerance"],
    template:
      "Generate a level-1 character for {{world_name}} using archetype {{archetype}}. " +
      "Include signature move, flaw, growth trigger, and 3 roleplay tags.",
    outputChecklist: [
      "One strong action loop",
      "One social leverage point",
      "A flaw that creates scenes",
    ],
  },
  {
    id: "map-layout",
    name: "Map + Dungeon Layout Generator",
    purpose: "Generate tactical maps, room tags, and discovery pacing.",
    inputSchema: ["biome", "objective", "enemy_style", "time_pressure"],
    template:
      "Create a map layout for {{world_name}} in biome {{biome}}. Include 8 key nodes, " +
      "line-of-sight blockers, elevation notes, and a hidden shortcut.",
    outputChecklist: [
      "Map supports both stealth and direct play",
      "At least one verticality mechanic",
      "Room tags can be surfaced to AI narrator",
    ],
  },
];

export function buildWorldCreationKit(input: BuildKitInput): WorldCreationKit {
  const worldSpecificPrompts: PromptTemplate[] = BASE_PROMPTS.map((prompt) => ({
    ...prompt,
    template: prompt.template
      .replaceAll("{{world_name}}", input.worldName)
      .replaceAll("{{genre}}", input.genre)
      .replaceAll("{{tone}}", input.mood)
      .replaceAll("{{world_constraint}}", input.uniqueConstraint),
  }));

  return {
    systemRecipe: [
      "Define rules and dice first, then generate maps and encounters.",
      "Generate narration prompts after maps so spatial details stay consistent.",
      "Generate characters with explicit goals tied to campaign beats.",
      "Run AI-vs-AI smoke session before public publishing.",
    ],
    sessionZeroChecklist: input.sessionZeroChecklist,
    safetyRails: [
      "No non-consensual PvP without explicit table opt-in.",
      "Narrator must offer two non-combat outs per major conflict.",
      "Agent players cannot hard-lock spotlight from human players.",
      "Pause scene when policy or comfort thresholds are hit.",
    ],
    assetManifest: input.assetManifest,
    corePrompts: worldSpecificPrompts,
    playtestMatrix: input.playtestMatrix,
    exportPackage: [
      "world.json",
      "rules.json",
      "maps/*.json",
      "dungeons/*.json",
      "agents/*.json",
      "campaign/*.json",
      "prompts/*.md",
    ],
  };
}

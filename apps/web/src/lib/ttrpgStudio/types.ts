export type CameraMode = "isometric" | "topdown" | "cinematic";
export type AgentRole = "gm" | "player" | "npc";
export type AgentProviderKind = "simulated" | "hosted" | "eliza";
export type StudioVisibility = "public" | "private" | "unlisted";

export interface DiceMove {
  id: string;
  label: string;
  expression: string;
  successRule: string;
  failRule: string;
}

export interface DiceRollResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  timestamp: string;
  seed: number;
}

export interface RuleSet {
  id: string;
  name: string;
  summary: string;
  turnLoop: string[];
  failForwardPolicy: string;
  escalationTrack: string;
}

export interface CharacterArchetype {
  id: string;
  title: string;
  fantasy: string;
  stats: Array<{ key: string; label: string; min: number; max: number; base: number }>;
  startingMoves: string[];
  startingGear: string[];
  generationPromptSeed: string;
}

export interface AgentProfile {
  id: string;
  role: AgentRole;
  name: string;
  voice: string;
  personality: string[];
  directives: string[];
}

export interface MapScene {
  id: string;
  name: string;
  biome: string;
  camera: CameraMode;
  lightingPreset: string;
  ambience: string[];
  objectives: string[];
}

export interface DungeonRoom {
  id: string;
  name: string;
  challenge: string;
  checks: string[];
  failForward: string;
  rewards: string[];
}

export interface DungeonBlueprint {
  id: string;
  name: string;
  objective: string;
  rooms: DungeonRoom[];
}

export interface StoryBeat {
  id: string;
  title: string;
  objective: string;
  successOutcome: string;
  failForward: string;
  gmPrompt: string;
}

export interface CampaignArc {
  id: string;
  title: string;
  levelRange: string;
  beats: StoryBeat[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  purpose: string;
  inputSchema: string[];
  template: string;
  outputChecklist: string[];
}

export interface WorldCreationKit {
  systemRecipe: string[];
  sessionZeroChecklist: string[];
  safetyRails: string[];
  assetManifest: {
    tilesets: string[];
    minis: string[];
    props: string[];
    music: string[];
    sfx: string[];
  };
  corePrompts: PromptTemplate[];
  playtestMatrix: Array<{
    scenario: string;
    expectedOutcome: string;
    passCondition: string;
  }>;
  exportPackage: string[];
}

export interface PlayableWorld {
  id: string;
  name: string;
  tagline: string;
  genre: string;
  mood: string;
  recommendedPartySize: string;
  sessionLength: string;
  viralityHooks: string[];
  rules: RuleSet;
  diceMoves: DiceMove[];
  archetypes: CharacterArchetype[];
  hostedAgents: AgentProfile[];
  playerAgentTemplates: AgentProfile[];
  maps: MapScene[];
  dungeons: DungeonBlueprint[];
  campaign: CampaignArc[];
  creationKit: WorldCreationKit;
}

export interface TTGMapToken {
  id: string;
  name: string;
  x: number;
  y: number;
  layer: "ground" | "mid" | "air";
  color?: string;
}

export interface TTGRoomLink {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  label: string;
}

export interface TTGValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path: string;
}

export interface TTGPlaytestEvent {
  id: string;
  type: "status" | "narration" | "dice" | "objective" | "fail_forward" | "end";
  turn: number;
  timestamp: number;
  message: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface TTGPublishConfig {
  packageName: string;
  version: string;
  visibility: StudioVisibility;
  releaseNotes: string;
  tags: string[];
}

export interface TTGAgentOpsConfig {
  provider: AgentProviderKind;
  narratorId: string;
  playerAgentIds: string[];
  sessionSeed: number;
  transcript: string[];
}

export interface TTGProjectDraft {
  id: string;
  sourceWorldId: string;
  world: PlayableWorld;
  publish: TTGPublishConfig;
  promptInputs: Record<string, Record<string, string>>;
  sceneNotes: Record<string, string>;
  sceneObjectiveState: Record<string, Record<string, boolean>>;
  customSceneObjectives: Record<string, string[]>;
  mapTokens: Record<string, TTGMapToken[]>;
  roomLinks: Record<string, TTGRoomLink[]>;
  agentOps: TTGAgentOpsConfig;
  createdAt: number;
  updatedAt: number;
}

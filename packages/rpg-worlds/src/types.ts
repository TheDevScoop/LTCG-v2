export type Visibility = "private" | "unlisted" | "public";

export interface RulesetDefinition {
  schemaVersion: string;
  id: string;
  name: string;
  license: "SRD-Open" | "Custom";
  compatibility: string;
  coreStats: string[];
  turnStructure: string[];
  rulesText: string[];
}

export interface DiceExpressionAST {
  schemaVersion: string;
  expression: string;
  diceCount: number;
  diceSides: number;
  modifier: number;
}

export interface CharacterTemplate {
  schemaVersion: string;
  classId: string;
  className: string;
  description: string;
  primaryStats: string[];
  progression: Array<{
    level: number;
    unlocks: string[];
  }>;
}

export interface CampaignGraph {
  schemaVersion: string;
  nodes: Array<{
    id: string;
    title: string;
    stageType: "combat" | "social" | "exploration" | "boss";
    summary: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    condition?: string;
  }>;
}

export interface SceneDefinition2D {
  schemaVersion: string;
  sceneId: string;
  title: string;
  gridSize: number;
  layers: Array<{
    id: string;
    type: "tiles" | "tokens" | "fx";
    source: string;
  }>;
}

export interface SceneDefinition3D {
  schemaVersion: string;
  sceneId: string;
  title: string;
  renderer: "three";
  meshes: Array<{
    id: string;
    asset: string;
    position: [number, number, number];
  }>;
  lights: Array<{
    type: "ambient" | "point" | "directional";
    intensity: number;
  }>;
}

export interface EncounterDefinition {
  schemaVersion: string;
  encounterId: string;
  sceneId: string;
  recommendedPartyLevel: number;
  enemies: Array<{
    id: string;
    role: string;
    count: number;
  }>;
}

export interface AgentRolePolicy {
  schemaVersion: string;
  role: "dm" | "player" | "narrator" | "npc_controller";
  autonomy: "full" | "proposal";
  allowedActionFamilies: string[];
  blockedActionFamilies: string[];
}

export interface SessionAction {
  schemaVersion: string;
  actorSeat: string;
  actionType: string;
  payload: Record<string, unknown>;
}

export interface SessionEvent {
  schemaVersion: string;
  eventId: string;
  eventType: string;
  actorSeat: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface SessionSnapshot {
  schemaVersion: string;
  snapshotVersion: number;
  state: Record<string, unknown>;
  checksum: string;
}

export interface MarketplaceListing {
  schemaVersion: string;
  listingId: string;
  itemType: "world" | "asset" | "ruleset" | "tool";
  title: string;
  priceUsdCents: number;
  creatorId: string;
}

export interface SafetyPolicy {
  schemaVersion: string;
  moderationVersion: string;
  blockedPatterns: string[];
  maxActionRatePerMinute: number;
  autoPauseThreshold: number;
}

export interface WorldManifest {
  schemaVersion: string;
  worldId: string;
  slug: string;
  title: string;
  genre: string;
  visibility: Visibility;
  description: string;
  tags: string[];
  ruleset: RulesetDefinition;
  characterTemplates: CharacterTemplate[];
  campaign: CampaignGraph;
  scenes2D: SceneDefinition2D[];
  scenes3D: SceneDefinition3D[];
  encounters: EncounterDefinition[];
  agentPolicies: AgentRolePolicy[];
  safety: SafetyPolicy;
}

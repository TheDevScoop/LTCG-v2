import { playableWorlds } from "./worlds";
import type {
  DiceRollResult,
  PromptTemplate,
  TTGMapToken,
  TTGProjectDraft,
  TTGValidationIssue,
} from "./types";

const toClone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const makeSeededRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sanitizePercent = (value: number) => Math.max(4, Math.min(96, Math.round(value)));

function buildDefaultMapTokens(archetypeNames: string[]): TTGMapToken[] {
  const defaults = [
    { x: 20, y: 24, layer: "ground" as const, color: "#ffcc00" },
    { x: 44, y: 48, layer: "mid" as const, color: "#33ccff" },
    { x: 70, y: 32, layer: "air" as const, color: "#ff7f50" },
  ];
  return archetypeNames.slice(0, 6).map((name, index) => {
    const baseline = defaults[index % defaults.length];
    return {
      id: makeId("token"),
      name,
      x: sanitizePercent(baseline.x + index * 6),
      y: sanitizePercent(baseline.y + index * 7),
      layer: baseline.layer,
      color: baseline.color,
    };
  });
}

export function createDraftFromWorld(worldId: string): TTGProjectDraft {
  const world = playableWorlds.find((entry) => entry.id === worldId);
  if (!world) {
    throw new Error(`World not found: ${worldId}`);
  }

  const now = Date.now();
  const worldClone = toClone(world);
  const promptInputs: Record<string, Record<string, string>> = {};
  for (const prompt of worldClone.creationKit.corePrompts) {
    promptInputs[prompt.id] = Object.fromEntries(prompt.inputSchema.map((key) => [key, ""]));
  }

  const sceneObjectiveState: Record<string, Record<string, boolean>> = {};
  for (const scene of worldClone.maps) {
    sceneObjectiveState[scene.id] = Object.fromEntries(
      scene.objectives.map((objective) => [objective, false]),
    );
  }

  const mapTokens: Record<string, TTGMapToken[]> = {};
  for (const scene of worldClone.maps) {
    mapTokens[scene.id] = buildDefaultMapTokens(worldClone.archetypes.map((entry) => entry.title));
  }

  const roomLinks: Record<string, { id: string; fromRoomId: string; toRoomId: string; label: string }[]> = {};
  for (const dungeon of worldClone.dungeons) {
    roomLinks[dungeon.id] = [];
  }

  return {
    id: makeId(`draft-${worldClone.id}`),
    sourceWorldId: worldClone.id,
    world: worldClone,
    publish: {
      packageName: `${worldClone.name} Creator Pack`,
      version: "1.0.0",
      visibility: "public",
      releaseNotes: `Release package for ${worldClone.name}.`,
      tags: [worldClone.genre, worldClone.mood],
    },
    promptInputs,
    sceneNotes: {},
    sceneObjectiveState,
    customSceneObjectives: {},
    mapTokens,
    roomLinks,
    agentOps: {
      provider: "simulated",
      narratorId: worldClone.hostedAgents[0]?.id ?? "",
      playerAgentIds: worldClone.playerAgentTemplates.slice(0, 2).map((entry) => entry.id),
      sessionSeed: 101,
      transcript: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function validateDraft(draft: TTGProjectDraft): TTGValidationIssue[] {
  const issues: TTGValidationIssue[] = [];

  if (!draft.world.name.trim()) {
    issues.push({
      severity: "error",
      code: "world_name_missing",
      message: "World name is required.",
      path: "world.name",
    });
  }

  if (!draft.world.tagline.trim()) {
    issues.push({
      severity: "warning",
      code: "world_tagline_missing",
      message: "Tagline is empty; discoverability may be reduced.",
      path: "world.tagline",
    });
  }

  if (draft.world.archetypes.length < 2) {
    issues.push({
      severity: "error",
      code: "archetypes_minimum",
      message: "At least two archetypes are required.",
      path: "world.archetypes",
    });
  }

  if (!draft.world.rules.summary.trim()) {
    issues.push({
      severity: "error",
      code: "rules_summary_missing",
      message: "Rules summary cannot be empty.",
      path: "world.rules.summary",
    });
  }

  draft.world.diceMoves.forEach((move, index) => {
    if (!move.expression.trim()) {
      issues.push({
        severity: "error",
        code: "dice_expression_missing",
        message: `Dice move ${move.label} needs an expression.`,
        path: `world.diceMoves.${index}.expression`,
      });
    }
  });

  draft.world.maps.forEach((scene, index) => {
    const objectiveCount =
      scene.objectives.length + (draft.customSceneObjectives[scene.id]?.length ?? 0);
    if (objectiveCount === 0) {
      issues.push({
        severity: "error",
        code: "map_objective_missing",
        message: `${scene.name} has no objectives.`,
        path: `world.maps.${index}.objectives`,
      });
    }
  });

  draft.world.dungeons.forEach((dungeon, dungeonIndex) => {
    if (!dungeon.rooms.length) {
      issues.push({
        severity: "error",
        code: "dungeon_rooms_missing",
        message: `${dungeon.name} needs at least one room.`,
        path: `world.dungeons.${dungeonIndex}.rooms`,
      });
      return;
    }

    dungeon.rooms.forEach((room, roomIndex) => {
      if (!room.challenge.trim()) {
        issues.push({
          severity: "warning",
          code: "dungeon_room_challenge_missing",
          message: `${room.name} should define a challenge.`,
          path: `world.dungeons.${dungeonIndex}.rooms.${roomIndex}.challenge`,
        });
      }
      if (!room.checks.length) {
        issues.push({
          severity: "warning",
          code: "dungeon_room_checks_missing",
          message: `${room.name} should have at least one check.`,
          path: `world.dungeons.${dungeonIndex}.rooms.${roomIndex}.checks`,
        });
      }
    });
  });

  if (!draft.publish.packageName.trim()) {
    issues.push({
      severity: "error",
      code: "package_name_missing",
      message: "Package name is required for publishing.",
      path: "publish.packageName",
    });
  }

  if (!/^\d+\.\d+\.\d+$/.test(draft.publish.version.trim())) {
    issues.push({
      severity: "error",
      code: "package_version_invalid",
      message: "Version must use semver format (x.y.z).",
      path: "publish.version",
    });
  }

  if (!draft.publish.releaseNotes.trim()) {
    issues.push({
      severity: "warning",
      code: "release_notes_missing",
      message: "Release notes are empty.",
      path: "publish.releaseNotes",
    });
  }

  if (!draft.world.creationKit.corePrompts.length) {
    issues.push({
      severity: "error",
      code: "prompt_templates_missing",
      message: "At least one prompt template is required.",
      path: "world.creationKit.corePrompts",
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      code: "preflight_clean",
      message: "Preflight checks passed. Project is release-ready.",
      path: "project",
    });
  }

  return issues;
}

export function compilePrompt(
  template: PromptTemplate,
  inputs: Record<string, string>,
): string {
  return template.template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const value = inputs[key];
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : `[missing:${key}]`;
  });
}

export function runDeterministicDice(expression: string, seed: number): DiceRollResult {
  const normalized = expression.replace(/\s+/g, "").toLowerCase();
  if (!normalized) {
    throw new Error("Dice expression is empty.");
  }

  const terms = normalized.match(/[+-]?[^+-]+/g);
  if (!terms || terms.length === 0) {
    throw new Error(`Invalid dice expression: ${expression}`);
  }

  const rng = makeSeededRng(seed);
  const rolls: number[] = [];
  let modifier = 0;
  let total = 0;

  for (const rawTerm of terms) {
    const sign = rawTerm.startsWith("-") ? -1 : 1;
    const term = rawTerm.replace(/^[+-]/, "");
    if (!term) continue;

    const diceMatch = term.match(/^(\d*)d(\d+)(?:\([^)]*\))?$/);
    if (diceMatch) {
      const count = Number(diceMatch[1] || "1");
      const sides = Number(diceMatch[2]);
      if (count <= 0 || sides <= 0) {
        throw new Error(`Invalid dice term: ${rawTerm}`);
      }
      for (let i = 0; i < count; i += 1) {
        const roll = Math.floor(rng() * sides) + 1;
        rolls.push(roll * sign);
        total += roll * sign;
      }
      continue;
    }

    if (/^\d+$/.test(term)) {
      const numeric = Number(term) * sign;
      modifier += numeric;
      total += numeric;
      continue;
    }

    throw new Error(`Unsupported dice term: ${rawTerm}`);
  }

  return {
    expression,
    rolls,
    modifier,
    total,
    timestamp: new Date().toISOString(),
    seed,
  };
}

export function serializeDraft(draft: TTGProjectDraft): string {
  return JSON.stringify(draft, null, 2);
}

export function deserializeDraft(payload: string): TTGProjectDraft {
  const parsed = JSON.parse(payload) as TTGProjectDraft;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid draft payload.");
  }
  if (!parsed.world || typeof parsed.world.name !== "string") {
    throw new Error("Draft payload is missing world metadata.");
  }
  if (!parsed.publish || typeof parsed.publish.packageName !== "string") {
    throw new Error("Draft payload is missing publish config.");
  }
  return parsed;
}

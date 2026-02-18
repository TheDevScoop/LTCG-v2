import { runDeterministicDice } from "@/lib/ttrpgStudio";
import type {
  AgentProviderKind,
  TTGPlaytestEvent,
  TTGProjectDraft,
} from "@/lib/ttrpgStudio";

export interface AgentHealth {
  connected: boolean;
  status: string;
  details?: string;
}

export interface TTGAgentSession {
  sessionId: string;
  provider: AgentProviderKind;
  draftId: string;
  seed: number;
  turn: number;
  status: "running" | "stopped";
}

export interface TTGAgentSessionConfig {
  provider: AgentProviderKind;
  draft: TTGProjectDraft;
  seed: number;
}

export interface TTGAgentAdapter {
  healthCheck(): Promise<AgentHealth>;
  startSession(config: TTGAgentSessionConfig): Promise<TTGAgentSession>;
  stepTurn(session: TTGAgentSession): Promise<TTGPlaytestEvent[]>;
  stopSession(session: TTGAgentSession): Promise<TTGPlaytestEvent[]>;
}

const makeId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const seededRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const simplifyExpression = (expression: string) =>
  expression
    .replace(/\s+/g, "")
    .replace(/stat|grit|presence|edge/gi, "2")
    .replace(/\(.*?\)/g, "");

type SimState = {
  rng: () => number;
  draft: TTGProjectDraft;
  objectivePool: string[];
  completedObjectives: Set<string>;
  maxTurns: number;
};

export class SimulatedAgentAdapter implements TTGAgentAdapter {
  private readonly sessions = new Map<string, SimState>();

  async healthCheck(): Promise<AgentHealth> {
    return {
      connected: true,
      status: "simulator-ready",
      details: "Deterministic simulator online.",
    };
  }

  async startSession(config: TTGAgentSessionConfig): Promise<TTGAgentSession> {
    const objectivePool = [
      ...config.draft.world.maps.flatMap((scene) => scene.objectives),
      ...(config.draft.customSceneObjectives[config.draft.world.maps[0]?.id ?? ""] ?? []),
    ];

    const session: TTGAgentSession = {
      sessionId: makeId("sim"),
      provider: "simulated",
      draftId: config.draft.id,
      seed: config.seed,
      turn: 0,
      status: "running",
    };

    this.sessions.set(session.sessionId, {
      rng: seededRng(config.seed),
      draft: config.draft,
      objectivePool,
      completedObjectives: new Set<string>(),
      maxTurns: 8,
    });

    return session;
  }

  async stepTurn(session: TTGAgentSession): Promise<TTGPlaytestEvent[]> {
    const state = this.sessions.get(session.sessionId);
    if (!state) {
      return [
        {
          id: makeId("event"),
          type: "status",
          turn: session.turn,
          timestamp: Date.now(),
          message: "Session state missing. Start a new simulated session.",
        },
      ];
    }

    if (session.status !== "running") {
      return [
        {
          id: makeId("event"),
          type: "status",
          turn: session.turn,
          timestamp: Date.now(),
          message: "Session is not running.",
        },
      ];
    }

    session.turn += 1;
    const now = Date.now();
    const narrator =
      state.draft.world.hostedAgents.find((agent) => agent.id === state.draft.agentOps.narratorId) ??
      state.draft.world.hostedAgents[0];
    const scene = state.draft.world.maps[(session.turn - 1) % state.draft.world.maps.length];
    const move = state.draft.world.diceMoves[(session.turn - 1) % state.draft.world.diceMoves.length];
    const dice = runDeterministicDice(simplifyExpression(move?.expression ?? "1d20+2"), session.seed + session.turn);

    const events: TTGPlaytestEvent[] = [
      {
        id: makeId("event"),
        type: "narration",
        turn: session.turn,
        timestamp: now,
        message: `${narrator?.name ?? "Narrator"}: ${scene?.name ?? "Unknown scene"} twists under pressure.`,
      },
      {
        id: makeId("event"),
        type: "dice",
        turn: session.turn,
        timestamp: now,
        message: `${move?.label ?? "Action Check"} => ${dice.total}`,
        data: {
          total: dice.total,
          modifier: dice.modifier,
        },
      },
    ];

    if (dice.total >= 12 && state.objectivePool.length > 0) {
      const remaining = state.objectivePool.filter((objective) => !state.completedObjectives.has(objective));
      const picked = remaining[0];
      if (picked) {
        state.completedObjectives.add(picked);
        events.push({
          id: makeId("event"),
          type: "objective",
          turn: session.turn,
          timestamp: now,
          message: `Objective secured: ${picked}`,
          data: {
            objective: picked,
            completed: true,
          },
        });
      }
    } else {
      events.push({
        id: makeId("event"),
        type: "fail_forward",
        turn: session.turn,
        timestamp: now,
        message: `Fail-forward: Heat rises and ${scene?.name ?? "the scene"} shifts against the party.`,
      });
    }

    if (
      state.completedObjectives.size >= Math.max(1, Math.min(3, state.objectivePool.length)) ||
      session.turn >= state.maxTurns
    ) {
      session.status = "stopped";
      events.push({
        id: makeId("event"),
        type: "end",
        turn: session.turn,
        timestamp: now,
        message: `Simulation complete in ${session.turn} turns. Objectives cleared: ${state.completedObjectives.size}.`,
        data: {
          turns: session.turn,
          objectivesCleared: state.completedObjectives.size,
        },
      });
    }

    return events;
  }

  async stopSession(session: TTGAgentSession): Promise<TTGPlaytestEvent[]> {
    session.status = "stopped";
    this.sessions.delete(session.sessionId);
    return [
      {
        id: makeId("event"),
        type: "status",
        turn: session.turn,
        timestamp: Date.now(),
        message: "Simulation stopped.",
      },
    ];
  }
}

class NotConnectedAdapter implements TTGAgentAdapter {
  constructor(private readonly provider: AgentProviderKind) {}

  async healthCheck(): Promise<AgentHealth> {
    return {
      connected: false,
      status: "not-connected",
      details: `${this.provider} adapter scaffolded but not connected yet.`,
    };
  }

  async startSession(config: TTGAgentSessionConfig): Promise<TTGAgentSession> {
    return {
      sessionId: makeId(this.provider),
      provider: this.provider,
      draftId: config.draft.id,
      seed: config.seed,
      turn: 0,
      status: "stopped",
    };
  }

  async stepTurn(session: TTGAgentSession): Promise<TTGPlaytestEvent[]> {
    return [
      {
        id: makeId("event"),
        type: "status",
        turn: session.turn,
        timestamp: Date.now(),
        message: `${this.provider} adapter is not connected. Switch to simulated mode or wire provider credentials.`,
      },
    ];
  }

  async stopSession(session: TTGAgentSession): Promise<TTGPlaytestEvent[]> {
    return [
      {
        id: makeId("event"),
        type: "status",
        turn: session.turn,
        timestamp: Date.now(),
        message: `${this.provider} adapter stopped.`,
      },
    ];
  }
}

export function createAgentAdapter(provider: AgentProviderKind): TTGAgentAdapter {
  if (provider === "simulated") {
    return new SimulatedAgentAdapter();
  }
  return new NotConnectedAdapter(provider);
}

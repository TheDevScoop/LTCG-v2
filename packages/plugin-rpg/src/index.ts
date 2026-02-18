type ActionResult = {
  text: string;
  data?: unknown;
};

type Runtime = {
  emitEvent?: (event: string, payload: Record<string, unknown>) => void;
};

type PluginAction = {
  name: string;
  description: string;
  handler: (input: Record<string, unknown>, runtime: Runtime) => Promise<ActionResult>;
};

type Plugin = {
  name: string;
  description: string;
  config: Record<string, string>;
  init: (config: Record<string, string>) => Promise<void>;
  actions: PluginAction[];
};

type AgentIdentity = {
  id: string;
  userId: string;
  name: string;
  apiKeyPrefix: string;
};

class RPGClient {
  constructor(private readonly apiUrl: string, private readonly apiKey: string) {}

  private async request(path: string, init?: RequestInit): Promise<any> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`RPG API ${response.status}: ${message}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  getMe(): Promise<AgentIdentity> {
    return this.request("/api/rpg/agent/me");
  }

  createSession(payload: Record<string, unknown>): Promise<any> {
    return this.request("/api/rpg/sessions/create", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  joinSession(payload: Record<string, unknown>): Promise<any> {
    return this.request("/api/rpg/sessions/join", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  getSessionState(sessionId: string): Promise<any> {
    const query = new URLSearchParams({ sessionId });
    return this.request(`/api/rpg/sessions/state?${query.toString()}`);
  }

  applyAction(payload: Record<string, unknown>): Promise<any> {
    return this.request("/api/rpg/sessions/action", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  rollDice(expression: string): Promise<any> {
    return this.request("/api/rpg/dice/roll", {
      method: "POST",
      body: JSON.stringify({ expression }),
    });
  }
}

let client: RPGClient | null = null;

function getEnvValue(key: string): string {
  return typeof process !== "undefined" && process.env ? process.env[key] ?? "" : "";
}

function requireClient(): RPGClient {
  if (!client) throw new Error("RPG client not initialized");
  return client;
}

const createSessionAction: PluginAction = {
  name: "CREATE_RPG_SESSION",
  description: "Create an RPG session for a world version.",
  handler: async (input, runtime) => {
    const result = await requireClient().createSession(input);
    runtime.emitEvent?.("ACTION_COMPLETED", { action: "CREATE_RPG_SESSION", sessionId: result.sessionId });
    return { text: `Created RPG session ${result.sessionId}`, data: result };
  },
};

const joinSessionAction: PluginAction = {
  name: "JOIN_RPG_SESSION",
  description: "Join an existing RPG session seat.",
  handler: async (input) => {
    const result = await requireClient().joinSession(input);
    return { text: `Joined seat ${result.seat} in session ${result.sessionId}`, data: result };
  },
};

const actAction: PluginAction = {
  name: "ACT_RPG_SESSION",
  description: "Apply an RPG action to a live session.",
  handler: async (input) => {
    const result = await requireClient().applyAction(input);
    return { text: `Applied RPG action for session ${String(input.sessionId ?? "unknown")}`, data: result };
  },
};

const getStatusAction: PluginAction = {
  name: "CHECK_RPG_SESSION",
  description: "Get latest state for an RPG session.",
  handler: async (input) => {
    const sessionId = String(input.sessionId ?? "");
    if (!sessionId) throw new Error("sessionId is required");
    const result = await requireClient().getSessionState(sessionId);
    return { text: `Session ${sessionId} status: ${result.status ?? "unknown"}`, data: result };
  },
};

const rollDiceAction: PluginAction = {
  name: "ROLL_RPG_DICE",
  description: "Roll a dice expression using server-side deterministic logic.",
  handler: async (input) => {
    const expression = String(input.expression ?? "");
    if (!expression) throw new Error("expression is required");
    const result = await requireClient().rollDice(expression);
    return { text: `Rolled ${expression}: ${result.roll?.total ?? "?"}`, data: result };
  },
};

const plugin: Plugin = {
  name: "lt-rpg",
  description: "Play and host LunchTable RPG sessions via API",
  config: {
    RPG_API_URL: getEnvValue("RPG_API_URL"),
    RPG_API_KEY: getEnvValue("RPG_API_KEY"),
  },
  async init(config) {
    const apiUrl = config.RPG_API_URL || getEnvValue("RPG_API_URL");
    const apiKey = config.RPG_API_KEY || getEnvValue("RPG_API_KEY");

    if (!apiUrl) throw new Error("RPG_API_URL is required.");
    if (!apiKey) throw new Error("RPG_API_KEY is required.");
    if (!apiKey.startsWith("rpg_") && !apiKey.startsWith("ltcg_")) {
      throw new Error("RPG_API_KEY must start with rpg_ (preferred) or ltcg_ (compat).");
    }

    client = new RPGClient(apiUrl, apiKey);
    const me = await client.getMe();
    console.log(`[RPG] Connected as ${me.name} (${me.apiKeyPrefix})`);
  },
  actions: [createSessionAction, joinSessionAction, actAction, getStatusAction, rollDiceAction],
};

export default plugin;
export { RPGClient };

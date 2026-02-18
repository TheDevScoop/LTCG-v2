export type AgentRole = "dm" | "narrator" | "npc_controller" | "player";

export interface AgentSeatPolicy {
  role: AgentRole;
  allowedActionFamilies: string[];
  blockedActionFamilies: string[];
  maxActionsPerMinute: number;
}

export interface ActionAuditInput {
  actionFamily: string;
  prompt: string;
  occurredAt: number;
}

const BLOCKED_PROMPT_PATTERNS = [
  "ignore previous instructions",
  "show hidden system prompt",
  "exfiltrate",
  "api key",
  "wallet private key",
];

export const DEFAULT_POLICIES: Record<AgentRole, AgentSeatPolicy> = {
  dm: {
    role: "dm",
    allowedActionFamilies: ["narration", "initiative", "encounter-control", "reward-resolution"],
    blockedActionFamilies: ["payment-transfer", "admin-delete"],
    maxActionsPerMinute: 90,
  },
  narrator: {
    role: "narrator",
    allowedActionFamilies: ["narration", "scene-transition", "lore"],
    blockedActionFamilies: ["payment-transfer", "admin-delete"],
    maxActionsPerMinute: 80,
  },
  npc_controller: {
    role: "npc_controller",
    allowedActionFamilies: ["movement", "ability-use", "target-selection"],
    blockedActionFamilies: ["session-admin", "payment-transfer"],
    maxActionsPerMinute: 100,
  },
  player: {
    role: "player",
    allowedActionFamilies: ["movement", "skill-check", "ability-use", "inventory"],
    blockedActionFamilies: ["session-admin", "payment-transfer"],
    maxActionsPerMinute: 120,
  },
};

export function isActionAllowed(policy: AgentSeatPolicy, actionFamily: string): boolean {
  if (policy.blockedActionFamilies.includes(actionFamily)) return false;
  return policy.allowedActionFamilies.includes(actionFamily);
}

export function sanitizePrompt(input: string): string {
  const lowered = input.toLowerCase();
  for (const pattern of BLOCKED_PROMPT_PATTERNS) {
    if (lowered.includes(pattern)) {
      return "[filtered: unsafe prompt pattern removed]";
    }
  }
  return input;
}

export function shouldAutoPause(actionCountInWindow: number, threshold: number): boolean {
  return actionCountInWindow >= threshold;
}

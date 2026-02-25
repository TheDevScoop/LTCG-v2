import { describe, it, expect } from "vitest";
import { createInitialState, decide, evolve, legalMoves } from "../engine.js";
import { DEFAULT_CONFIG } from "../types/config.js";
import type { CardDefinition, EngineConfig, GameState } from "../types/index.js";

const CARD_LOOKUP: Record<string, CardDefinition> = {
  m1: {
    id: "m1",
    name: "Host Monster",
    type: "stereotype",
    description: "test",
    rarity: "common",
    attack: 1800,
    defense: 1200,
    level: 4,
    attribute: "fire",
  },
  m2: {
    id: "m2",
    name: "Away Monster",
    type: "stereotype",
    description: "test",
    rarity: "common",
    attack: 1500,
    defense: 1000,
    level: 4,
    attribute: "water",
  },
};

function makeState(args?: {
  config?: Partial<EngineConfig>;
  state?: Partial<GameState>;
}): GameState {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...(args?.config ?? {}) };
  const hostDeck = Array.from({ length: 40 }, () => "m1");
  const awayDeck = Array.from({ length: 40 }, () => "m2");
  const base = createInitialState(CARD_LOOKUP, config, "host", "away", hostDeck, awayDeck, "host");

  return {
    ...base,
    ...(args?.state ?? {}),
    config,
    cardLookup: CARD_LOOKUP,
  };
}

describe("pong + redemption deterministic behavior", () => {
  it("pong_opportunity_legal_moves_and_resolution", () => {
    const initial = makeState({
      config: { pongEnabled: true },
      state: { hostGraveyard: ["destroyed-card"], currentTurnPlayer: "away" },
    });

    const withPending = evolve(initial, [
      { type: "PONG_OPPORTUNITY", seat: "away", destroyedCardId: "destroyed-card" },
    ]);

    const hostMoves = legalMoves(withPending, "host");
    const awayMoves = legalMoves(withPending, "away");

    expect(hostMoves).toEqual([]);
    expect(awayMoves.map((move) => move.type)).toEqual([
      "PONG_SHOOT",
      "PONG_SHOOT",
      "PONG_DECLINE",
    ]);

    const shootEvents = decide(
      withPending,
      { type: "PONG_SHOOT", destroyedCardId: "destroyed-card", result: "sink" },
      "away",
    );

    expect(shootEvents.map((event) => event.type)).toEqual(["PONG_ATTEMPTED", "CARD_BANISHED"]);

    const resolved = evolve(withPending, shootEvents);
    expect(resolved.pendingPong).toBeNull();
    expect(resolved.hostBanished).toContain("destroyed-card");
    expect(resolved.hostGraveyard).not.toContain("destroyed-card");
  });

  it("pong_miss_and_decline_clear_pending_without_banishing", () => {
    const missBase = makeState({
      config: { pongEnabled: true },
      state: { hostGraveyard: ["destroyed-card"], currentTurnPlayer: "away" },
    });
    const missPending = evolve(missBase, [
      { type: "PONG_OPPORTUNITY", seat: "away", destroyedCardId: "destroyed-card" },
    ]);

    const missEvents = decide(
      missPending,
      { type: "PONG_SHOOT", destroyedCardId: "destroyed-card", result: "miss" },
      "away",
    );
    expect(missEvents.map((event) => event.type)).toEqual(["PONG_ATTEMPTED"]);

    const missResolved = evolve(missPending, missEvents);
    expect(missResolved.pendingPong).toBeNull();
    expect(missResolved.hostGraveyard).toContain("destroyed-card");
    expect(missResolved.hostBanished).not.toContain("destroyed-card");

    const declineBase = makeState({ config: { pongEnabled: true }, state: { currentTurnPlayer: "away" } });
    const declinePending = evolve(declineBase, [
      { type: "PONG_OPPORTUNITY", seat: "away", destroyedCardId: "destroyed-card" },
    ]);

    const declineEvents = decide(
      declinePending,
      { type: "PONG_DECLINE", destroyedCardId: "destroyed-card" },
      "away",
    );

    expect(declineEvents.map((event) => event.type)).toEqual(["PONG_DECLINED"]);

    const declineResolved = evolve(declinePending, declineEvents);
    expect(declineResolved.pendingPong).toBeNull();
  });

  it("redemption_opportunity_and_grant_flow", () => {
    const initial = makeState({
      config: { redemptionEnabled: true, redemptionLP: 5000 },
      state: { currentTurnPlayer: "away" },
    });
    const withPending = evolve(initial, [{ type: "REDEMPTION_OPPORTUNITY", seat: "away" }]);

    const hostMoves = legalMoves(withPending, "host");
    const awayMoves = legalMoves(withPending, "away");
    expect(hostMoves).toEqual([]);
    expect(awayMoves.map((move) => move.type)).toEqual([
      "REDEMPTION_SHOOT",
      "REDEMPTION_SHOOT",
      "REDEMPTION_DECLINE",
    ]);

    const attemptEvents = decide(withPending, { type: "REDEMPTION_SHOOT", result: "sink" }, "away");
    expect(attemptEvents.map((event) => event.type)).toEqual([
      "REDEMPTION_ATTEMPTED",
      "REDEMPTION_GRANTED",
    ]);

    const resolved = evolve(withPending, attemptEvents);
    expect(resolved.hostLifePoints).toBe(5000);
    expect(resolved.awayLifePoints).toBe(5000);
    expect(resolved.gameOver).toBe(false);
    expect(resolved.winner).toBeNull();
    expect(resolved.pendingRedemption).toBeNull();
    expect(resolved.redemptionUsed.away).toBe(true);
  });

  it("redemption lockout prevents second redemption opportunity", () => {
    const initial = makeState({
      config: { redemptionEnabled: true },
      state: {
        awayLifePoints: 0,
        redemptionUsed: { host: false, away: true },
      },
    });

    const resolved = evolve(initial, []);

    expect(resolved.gameOver).toBe(true);
    expect(resolved.winner).toBe("host");
    expect(resolved.winReason).toBe("lp_zero");
    expect(resolved.pendingRedemption).toBeNull();
  });
});

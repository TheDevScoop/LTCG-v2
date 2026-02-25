import { describe, expect, it } from "vitest";
import {
  clampSeat,
  resolveHostLookupId,
  resolveSpectatorTarget,
} from "./useAgentSpectator";

describe("clampSeat", () => {
  it("accepts host and away", () => {
    expect(clampSeat("host")).toBe("host");
    expect(clampSeat("away")).toBe("away");
  });

  it("returns null for invalid values", () => {
    expect(clampSeat("spectator")).toBeNull();
    expect(clampSeat(undefined)).toBeNull();
    expect(clampSeat(null)).toBeNull();
  });
});

describe("resolveHostLookupId", () => {
  it("returns null when explicit matchId is provided", () => {
    expect(
      resolveHostLookupId({
        queryMatchId: "match_123",
        queryHostId: "user_host",
        agentUserId: "user_agent",
      }),
    ).toBeNull();
  });

  it("prefers explicit hostId over agent user id", () => {
    expect(
      resolveHostLookupId({
        queryMatchId: null,
        queryHostId: "user_host",
        agentUserId: "user_agent",
      }),
    ).toBe("user_host");
  });

  it("falls back to agent user id when hostId is absent", () => {
    expect(
      resolveHostLookupId({
        queryMatchId: null,
        queryHostId: null,
        agentUserId: "user_agent",
      }),
    ).toBe("user_agent");
  });
});

describe("resolveSpectatorTarget", () => {
  it("uses override target first", () => {
    expect(
      resolveSpectatorTarget({
        overrideMatchId: "match_override",
        overrideSeat: "away",
        queryMatchId: "match_query",
        querySeat: "host",
        autoMatchId: "match_auto",
        autoSeat: "away",
      }),
    ).toEqual({ matchId: "match_override", seat: "away" });
  });

  it("uses query params before auto-discovery", () => {
    expect(
      resolveSpectatorTarget({
        overrideMatchId: null,
        overrideSeat: null,
        queryMatchId: "match_query",
        querySeat: "away",
        autoMatchId: "match_auto",
        autoSeat: "host",
      }),
    ).toEqual({ matchId: "match_query", seat: "away" });
  });

  it("falls back to auto match and defaults seat to host", () => {
    expect(
      resolveSpectatorTarget({
        overrideMatchId: null,
        overrideSeat: null,
        queryMatchId: null,
        querySeat: null,
        autoMatchId: "match_auto",
        autoSeat: null,
      }),
    ).toEqual({ matchId: "match_auto", seat: "host" });
  });
});

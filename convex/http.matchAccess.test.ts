import { describe, expect, it, vi } from "vitest";
import { resolveMatchAndSeat } from "./http";

describe("resolveMatchAndSeat", () => {
  it("resolves seat from authenticated participant when seat is omitted", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      hostId: "host_user",
      awayId: "away_user",
      status: "active",
    });

    const result = await resolveMatchAndSeat(
      { runQuery },
      "host_user",
      "match_1",
    );

    expect(result.seat).toBe("host");
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runQuery.mock.calls[0]![1]).toEqual({
      matchId: "match_1",
      actorUserId: "host_user",
    });
  });

  it("respects explicitly requested seat for the same participant", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      hostId: "host_user",
      awayId: "away_user",
    });

    const result = await resolveMatchAndSeat(
      { runQuery },
      "away_user",
      "match_1",
      "away",
    );

    expect(result.seat).toBe("away");
  });

  it("throws for invalid seat values", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      hostId: "host_user",
      awayId: "away_user",
    });

    await expect(
      resolveMatchAndSeat({ runQuery }, "host_user", "match_1", "spectator"),
    ).rejects.toThrow("seat must be 'host' or 'away'.");
  });

  it("throws when requested seat does not match authenticated player", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      hostId: "host_user",
      awayId: "away_user",
    });

    await expect(
      resolveMatchAndSeat({ runQuery }, "host_user", "match_1", "away"),
    ).rejects.toThrow("You are not the away player in this match.");
  });

  it("throws when authenticated user is not in the match", async () => {
    const runQuery = vi.fn().mockResolvedValue({
      hostId: "host_user",
      awayId: "away_user",
    });

    await expect(
      resolveMatchAndSeat({ runQuery }, "intruder", "match_1"),
    ).rejects.toThrow("You are not a participant in this match.");
  });

  it("throws when match does not exist", async () => {
    const runQuery = vi.fn().mockResolvedValue(null);

    await expect(
      resolveMatchAndSeat({ runQuery }, "host_user", "missing_match"),
    ).rejects.toThrow("Match not found");
  });
});

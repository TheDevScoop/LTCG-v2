import { describe, expect, it, vi } from "vitest";
import { submitAction } from "../mutations";

function makeContext(latestVersion: number) {
  return {
    db: {
      get: vi.fn().mockResolvedValue({
        _id: "match_1",
        status: "active",
        awayId: "away_user",
      }),
      query: vi.fn((table: string) => {
        if (table !== "matchSnapshots") {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          withIndex: vi.fn(() => ({
            order: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                version: latestVersion,
                state: "{}",
              }),
            })),
          })),
        };
      }),
    },
  };
}

describe("submitAction optimistic concurrency", () => {
  it("rejects stale expectedVersion with a stable mismatch error", async () => {
    const ctx = makeContext(7);

    await expect(
      (submitAction as any)._handler(ctx, {
        matchId: "match_1",
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
        expectedVersion: 3,
      }),
    ).rejects.toThrow("submitAction version mismatch; state updated by another action.");
  });

  it("rejects missing expectedVersion before command execution", async () => {
    const ctx = makeContext(2);

    await expect(
      (submitAction as any)._handler(ctx, {
        matchId: "match_1",
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      }),
    ).rejects.toThrow("submitAction version mismatch; state updated by another action.");
  });
});

import { describe, expect, it } from "vitest";
import { assertMatchParticipant, resolveSeatForUser } from "./matchAccess";

describe("resolveSeatForUser", () => {
  const meta = { hostId: "host_user", awayId: "away_user" };

  it("resolves host seat for host user", () => {
    expect(resolveSeatForUser(meta, "host_user")).toBe("host");
  });

  it("resolves away seat for away user", () => {
    expect(resolveSeatForUser(meta, "away_user")).toBe("away");
  });

  it("returns null for non-participants", () => {
    expect(resolveSeatForUser(meta, "intruder")).toBeNull();
  });
});

describe("assertMatchParticipant", () => {
  const meta = { hostId: "host_user", awayId: "away_user" };

  it("returns participant seat when user belongs to the match", () => {
    expect(assertMatchParticipant(meta, "host_user")).toBe("host");
    expect(assertMatchParticipant(meta, "away_user")).toBe("away");
  });

  it("throws for users not in the match", () => {
    expect(() => assertMatchParticipant(meta, "intruder")).toThrow(
      "You are not a participant in this match."
    );
  });

  it("throws when requested seat does not match authenticated participant", () => {
    expect(() => assertMatchParticipant(meta, "host_user", "away")).toThrow(
      "Seat does not match the authenticated player."
    );
  });
});

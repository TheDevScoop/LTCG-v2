import { describe, expect, it, vi } from "vitest";
import { __test } from "./game";

describe("resolveActor", () => {
  it("returns provided actor user when actorUserId is valid", async () => {
    const getUserById = vi.fn().mockResolvedValue({ _id: "user_1" });
    const requireUserFn = vi.fn();

    const actor = await __test.resolveActor(
      {},
      "user_1",
      { getUserById, requireUserFn },
    );

    expect(actor._id).toBe("user_1");
    expect(getUserById).toHaveBeenCalledWith({}, "user_1");
    expect(requireUserFn).not.toHaveBeenCalled();
  });

  it("throws when actorUserId does not resolve to a user", async () => {
    const getUserById = vi.fn().mockResolvedValue(null);

    await expect(
      __test.resolveActor({}, "missing_user", { getUserById }),
    ).rejects.toThrow("Actor user not found.");
  });

  it("falls back to authenticated user when actorUserId is missing", async () => {
    const requireUserFn = vi.fn().mockResolvedValue({ _id: "session_user" });
    const getUserById = vi.fn();

    const actor = await __test.resolveActor(
      {},
      undefined,
      { getUserById, requireUserFn },
    );

    expect(actor._id).toBe("session_user");
    expect(requireUserFn).toHaveBeenCalledWith({});
    expect(getUserById).not.toHaveBeenCalled();
  });
});

describe("assertActorMatchesAuthenticatedUser", () => {
  it("returns authenticated user when actorUserId matches", async () => {
    const requireUserFn = vi.fn().mockResolvedValue({ _id: "user_1" });

    const user = await __test.assertActorMatchesAuthenticatedUser(
      {},
      "user_1",
      { requireUserFn },
    );

    expect(user._id).toBe("user_1");
    expect(requireUserFn).toHaveBeenCalledWith({});
  });

  it("throws when actorUserId does not match authenticated user", async () => {
    const requireUserFn = vi.fn().mockResolvedValue({ _id: "user_1" });

    await expect(
      __test.assertActorMatchesAuthenticatedUser(
        {},
        "user_2",
        { requireUserFn },
      ),
    ).rejects.toThrow("actorUserId must match authenticated user.");
  });

  it("returns authenticated user when actorUserId is omitted", async () => {
    const requireUserFn = vi.fn().mockResolvedValue({ _id: "user_1" });

    const user = await __test.assertActorMatchesAuthenticatedUser(
      {},
      undefined,
      { requireUserFn },
    );

    expect(user._id).toBe("user_1");
    expect(requireUserFn).toHaveBeenCalledWith({});
  });
});

describe("requireMatchParticipant", () => {
  it("returns participant seat for a valid match participant", async () => {
    const result = await __test.requireMatchParticipant(
      {},
      "match_1",
      undefined,
      "host_user",
      {
        resolveActorFn: vi.fn().mockResolvedValue({ _id: "host_user" }),
        getMatchMetaFn: vi.fn().mockResolvedValue({
          hostId: "host_user",
          awayId: "away_user",
        }),
      },
    );

    expect(result.seat).toBe("host");
  });

  it("throws when match metadata does not exist", async () => {
    await expect(
      __test.requireMatchParticipant(
        {},
        "missing_match",
        undefined,
        "host_user",
        {
          resolveActorFn: vi.fn().mockResolvedValue({ _id: "host_user" }),
          getMatchMetaFn: vi.fn().mockResolvedValue(null),
        },
      ),
    ).rejects.toThrow("Match not found.");
  });

  it("throws when requested seat does not match participant seat", async () => {
    await expect(
      __test.requireMatchParticipant(
        {},
        "match_1",
        "away",
        "host_user",
        {
          resolveActorFn: vi.fn().mockResolvedValue({ _id: "host_user" }),
          getMatchMetaFn: vi.fn().mockResolvedValue({
            hostId: "host_user",
            awayId: "away_user",
          }),
        },
      ),
    ).rejects.toThrow("Seat does not match the authenticated player.");
  });

  it("throws when requester is not a participant", async () => {
    await expect(
      __test.requireMatchParticipant(
        {},
        "match_1",
        undefined,
        "intruder",
        {
          resolveActorFn: vi.fn().mockResolvedValue({ _id: "intruder" }),
          getMatchMetaFn: vi.fn().mockResolvedValue({
            hostId: "host_user",
            awayId: "away_user",
          }),
        },
      ),
    ).rejects.toThrow("You are not a participant in this match.");
  });
});

describe("assertStoryMatchRequesterAuthorized", () => {
  it("allows the story owner even if they are no longer a seat participant", () => {
    expect(() =>
      __test.assertStoryMatchRequesterAuthorized(
        { userId: "story_owner" },
        "story_owner",
        { hostId: "host_user", awayId: "away_user" },
      ),
    ).not.toThrow();
  });

  it("allows match participants who are not the story owner", () => {
    expect(() =>
      __test.assertStoryMatchRequesterAuthorized(
        { userId: "story_owner" },
        "host_user",
        { hostId: "host_user", awayId: "away_user" },
      ),
    ).not.toThrow();
  });

  it("throws when requester is neither owner nor participant", () => {
    expect(() =>
      __test.assertStoryMatchRequesterAuthorized(
        { userId: "story_owner" },
        "intruder",
        { hostId: "host_user", awayId: "away_user" },
      ),
    ).toThrow("Not your match");
  });
});

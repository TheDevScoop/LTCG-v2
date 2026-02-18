import { describe, expect, it } from "vitest";
import type { MatchPlatformPresence } from "./convexTypes";
import { playerPlatformLabels, toPlatformTag } from "./platformPresence";

describe("platformPresence helpers", () => {
  it("maps client platforms to tags", () => {
    expect(toPlatformTag("web")).toBe("WEB");
    expect(toPlatformTag("telegram_inline")).toBe("TG_INLINE");
    expect(toPlatformTag("telegram_miniapp")).toBe("TG_MINIAPP");
    expect(toPlatformTag("agent")).toBe("AGENT");
    expect(toPlatformTag("cpu")).toBe("CPU");
  });

  it("returns player/opponent tags by seat", () => {
    const presence: MatchPlatformPresence = {
      matchId: "m1",
      hostUserId: "u1",
      awayUserId: "u2",
      hostPlatform: "telegram_miniapp",
      awayPlatform: "web",
      hostLastActiveAt: 1,
      awayLastActiveAt: 2,
    };

    expect(playerPlatformLabels(presence, "host")).toEqual({
      playerTag: "TG_MINIAPP",
      opponentTag: "WEB",
    });
    expect(playerPlatformLabels(presence, "away")).toEqual({
      playerTag: "WEB",
      opponentTag: "TG_MINIAPP",
    });
  });
});

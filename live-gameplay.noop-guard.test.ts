import { describe, expect, it } from "vitest";
import { NoopProgressionGuard, parseSubmitEvents } from "./scripts/live-gameplay/noopGuard";

describe("live gameplay no-op guard", () => {
  it("parses empty event payloads as no-op", () => {
    const parsed = parseSubmitEvents({ events: "[]", version: 3 });
    expect(parsed.validPayload).toBe(true);
    expect(parsed.isNoop).toBe(true);
    expect(parsed.eventCount).toBe(0);
  });

  it("triggers forced progression after repeated no-op command signatures", () => {
    const guard = new NoopProgressionGuard(3);
    const command = { type: "SUMMON", cardId: "monster_a" };
    const signature = "turn:host|phase:main";

    const first = guard.register({
      signature,
      command,
      submitResult: { events: "[]", version: 1 },
    });
    const second = guard.register({
      signature,
      command,
      submitResult: { events: "[]", version: 1 },
    });
    const third = guard.register({
      signature,
      command,
      submitResult: { events: "[]", version: 1 },
    });

    expect(first.shouldForceProgression).toBe(false);
    expect(second.shouldForceProgression).toBe(false);
    expect(third.shouldForceProgression).toBe(true);
    expect(third.repeats).toBe(3);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  applySinceVersionIndex,
  mapRecentEventsRows,
} from "../queries";

describe("applySinceVersionIndex", () => {
  it("applies both match and version predicates", () => {
    const gt = vi.fn(() => "filtered-result");
    const eq = vi.fn(() => ({ gt }));
    const builder = { eq };

    const result = applySinceVersionIndex(builder, "match_123", 17);

    expect(result).toBe("filtered-result");
    expect(eq).toHaveBeenCalledWith("matchId", "match_123");
    expect(gt).toHaveBeenCalledWith("version", 17);
  });
});

describe("mapRecentEventsRows", () => {
  it("maps query rows to response shape without dropping fields", () => {
    const rows = [
      {
        version: 4,
        events: '[{"type":"PHASE_CHANGED"}]',
        command: '{"type":"ADVANCE_PHASE"}',
        seat: "host",
        createdAt: 1_700_000_000_000,
      },
    ];

    expect(mapRecentEventsRows(rows)).toEqual(rows);
  });
});

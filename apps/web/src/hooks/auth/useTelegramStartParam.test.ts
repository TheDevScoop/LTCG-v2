import { describe, expect, it } from "vitest";
import { extractMatchIdFromStartParam } from "./useTelegramStartParam";

describe("extractMatchIdFromStartParam", () => {
  it("extracts match ids from m_ prefixed payloads", () => {
    expect(extractMatchIdFromStartParam("m_abc123")).toBe("abc123");
  });

  it("returns null for missing or invalid payloads", () => {
    expect(extractMatchIdFromStartParam(null)).toBeNull();
    expect(extractMatchIdFromStartParam("")).toBeNull();
    expect(extractMatchIdFromStartParam("abc123")).toBeNull();
  });
});

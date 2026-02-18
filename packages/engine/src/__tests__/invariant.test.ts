import { describe, expect, it } from "vitest";
import { expectDefined } from "../internal/invariant.js";

describe("expectDefined", () => {
  it("returns the value when defined", () => {
    expect(expectDefined("ok", "ctx")).toBe("ok");
    expect(expectDefined(0, "ctx")).toBe(0);
  });

  it("throws with engine invariant prefix for undefined values", () => {
    expect(() => expectDefined(undefined, "missing value")).toThrow("[engine invariant]");
  });
});

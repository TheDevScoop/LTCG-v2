import { describe, expect, it } from "vitest";
import { shouldWaitForConvexAuth } from "./userSyncFlags";

describe("shouldWaitForConvexAuth", () => {
  it("does not wait when Privy is not authenticated", () => {
    expect(
      shouldWaitForConvexAuth({
        privyAuthenticated: false,
        convexIsAuthenticated: false,
      }),
    ).toBe(false);
  });

  it("does not wait when Convex is already authenticated", () => {
    expect(
      shouldWaitForConvexAuth({
        privyAuthenticated: true,
        convexIsAuthenticated: true,
      }),
    ).toBe(false);
  });

  it("waits when Privy is authenticated but Convex is not yet authenticated", () => {
    expect(
      shouldWaitForConvexAuth({
        privyAuthenticated: true,
        convexIsAuthenticated: false,
      }),
    ).toBe(true);
  });
});

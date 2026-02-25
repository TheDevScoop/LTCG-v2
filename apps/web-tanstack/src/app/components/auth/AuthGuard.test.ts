import { describe, expect, it } from "vitest";
import { buildAuthRedirectTarget, shouldClearStoredRedirect } from "../../hooks/auth/redirectTargets";

describe("buildAuthRedirectTarget", () => {
  it("includes pathname, search, and hash", () => {
    expect(
      buildAuthRedirectTarget({
        pathname: "/duel",
        search: "?join=abc123",
        hash: "#invite",
      }),
    ).toBe("/duel?join=abc123#invite");
  });

  it("falls back to pathname when search/hash are missing", () => {
    expect(
      buildAuthRedirectTarget({
        pathname: "/play/xyz",
      }),
    ).toBe("/play/xyz");
  });

  it("clears redirect only when the target is reached without onboarding", () => {
    expect(
      shouldClearStoredRedirect({
        storedRedirect: "/duel?join=abc123",
        currentTarget: "/duel?join=abc123",
        needsOnboarding: false,
      }),
    ).toBe(true);

    expect(
      shouldClearStoredRedirect({
        storedRedirect: "/duel?join=abc123",
        currentTarget: "/onboarding",
        needsOnboarding: true,
      }),
    ).toBe(false);

    expect(
      shouldClearStoredRedirect({
        storedRedirect: null,
        currentTarget: "/duel?join=abc123",
        needsOnboarding: false,
      }),
    ).toBe(false);
  });
});

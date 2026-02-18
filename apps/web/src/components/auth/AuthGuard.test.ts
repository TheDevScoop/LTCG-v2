import { describe, expect, it } from "vitest";
import { buildAuthRedirectTarget } from "../../hooks/auth/redirectTargets";

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
});

import { describe, expect, it } from "vitest";
import { redactSecrets } from "./security";

describe("redactSecrets", () => {
  it("redacts nested secret keys", () => {
    const result = redactSecrets({
      apiKey: "secret-value",
      nested: {
        token: "abc",
      },
      publicField: "ok",
    }) as Record<string, unknown>;

    expect(result.apiKey).toBe("[REDACTED]");
    expect((result.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect(result.publicField).toBe("ok");
  });
});

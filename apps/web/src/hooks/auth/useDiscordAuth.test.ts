import { describe, expect, it } from "vitest";
import { hasLinkedDiscordAccount } from "./useDiscordAuth";

describe("hasLinkedDiscordAccount", () => {
  it("returns true when discord_oauth is linked", () => {
    expect(
      hasLinkedDiscordAccount({
        linkedAccounts: [{ type: "email" }, { type: "discord_oauth" }],
      }),
    ).toBe(true);
  });

  it("returns false when discord_oauth is missing", () => {
    expect(
      hasLinkedDiscordAccount({
        linkedAccounts: [{ type: "email" }, { type: "telegram" }],
      }),
    ).toBe(false);
    expect(hasLinkedDiscordAccount(null)).toBe(false);
  });
});

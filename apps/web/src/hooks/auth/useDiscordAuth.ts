import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useDiscordActivity } from "../useDiscordActivity";

export function hasLinkedDiscordAccount(
  user: { linkedAccounts?: Array<{ type?: string }> } | null | undefined,
) {
  if (!user?.linkedAccounts) return false;
  return user.linkedAccounts.some((account) => account.type === "discord_oauth");
}

/**
 * Ensures authenticated users inside Discord Activity have
 * their Discord OAuth account linked in Privy.
 */
export function useDiscordAuth() {
  const { ready, authenticated, user, linkDiscord } = usePrivy();
  const { isDiscordActivity } = useDiscordActivity();
  const linkedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !isDiscordActivity || !authenticated || !user) return;
    if (linkedUserRef.current === user.id) return;

    if (hasLinkedDiscordAccount(user)) {
      linkedUserRef.current = user.id;
      return;
    }

    linkDiscord();
    linkedUserRef.current = user.id;
  }, [ready, isDiscordActivity, authenticated, user, linkDiscord]);
}

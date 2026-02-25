import { useEffect } from "react";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import { describeClientPlatform, detectClientPlatform } from "@/lib/clientPlatform";

const PRESENCE_HEARTBEAT_MS = 15000;

/**
 * Sends periodic presence updates so both players can see
 * where each participant is currently playing from.
 */
export function useMatchPresence(matchId: string | null | undefined) {
  const upsertPresence = useConvexMutation(apiAny.game.upsertMatchPresence);

  useEffect(() => {
    if (!matchId) return;

    let cancelled = false;
    const platform = detectClientPlatform();
    const source = describeClientPlatform();

    const publish = async () => {
      if (cancelled) return;
      try {
        await upsertPresence({ matchId, platform, source });
      } catch {
        // Ignore transient auth/role races while match seats settle.
      }
    };

    void publish();
    const timer = window.setInterval(() => {
      void publish();
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [matchId, upsertPresence]);
}

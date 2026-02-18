import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { apiAny, useConvexMutation } from "../../lib/convexHelpers";

/**
 * Detect if running inside a Telegram mini app.
 * Checks for Telegram WebApp object or URL hash params.
 */
export function isTelegramMiniApp(): boolean {
  return detectTelegramMiniApp();
}

/**
 * Handles Telegram mini app auto-login.
 *
 * When the app is opened inside Telegram (via @LunchLady_bot),
 * Privy automatically authenticates the user — no login() call needed.
 * This hook links the Telegram account if the user is already
 * authenticated but hasn't linked Telegram yet.
 *
 * Per Privy docs: "Privy will automatically log your user in when
 * initiated from within Telegram."
 */
export function useTelegramAuth() {
  if (!PRIVY_ENABLED) {
    return { isTelegram: false };
  }

  const { authenticated, user, linkTelegram } = usePrivy();
  const linkTelegramFromMiniApp = useConvexMutation(apiAny.telegram.linkTelegramFromMiniApp);
  const linked = useRef(false);
  const linking = useRef(false);
  const attempted = useRef(false);
  const isTelegram = isTelegramMiniApp();

  useEffect(() => {
    if (!authenticated) {
      linked.current = false;
      linking.current = false;
      attempted.current = false;
      return;
    }
    if (!isTelegram || linked.current || linking.current || attempted.current) return;

    const hasTelegram = user?.linkedAccounts?.some(
      (a) => a.type === "telegram",
    );

    async function link() {
      linking.current = true;
      attempted.current = true;
      try {
        const { retrieveRawInitData } = await import("@telegram-apps/bridge");
        const initDataRaw = retrieveRawInitData() ?? "";
        if (!initDataRaw) return;

        // Ensure Privy account link is established first.
        if (!hasTelegram) {
          await linkTelegram({ launchParams: { initDataRaw } });
        }

        // Mirror Telegram identity into Convex for inline-web cross-play.
        await linkTelegramFromMiniApp({ initDataRaw });
        linked.current = true;
      } catch {
        // Linking may fail if already linked or params expired — safe to ignore
      } finally {
        linking.current = false;
      }
    }

    link();
  }, [isTelegram, authenticated, user, linkTelegram, linkTelegramFromMiniApp]);

  return { isTelegram };
}

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { apiAny, useConvexMutation } from "../../lib/convexHelpers";

/**
 * Detect if running inside a Telegram mini app.
 * Checks for Telegram WebApp object or URL hash params.
 */
export function isTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  // Telegram injects this on the window object inside mini apps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Telegram?.WebApp?.initData;
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
  const { authenticated, user, linkTelegram } = usePrivy();
  const linkTelegramFromMiniApp = useConvexMutation(apiAny.telegram.linkTelegramFromMiniApp);
  const linked = useRef(false);
  const isTelegram = isTelegramMiniApp();

  useEffect(() => {
    if (!isTelegram || !authenticated || linked.current) return;

    const hasTelegram = user?.linkedAccounts?.some(
      (a) => a.type === "telegram",
    );

    async function link() {
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
      }
    }

    link();
  }, [isTelegram, authenticated, user, linkTelegram, linkTelegramFromMiniApp]);

  return { isTelegram };
}

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { isTelegramMiniApp as detectTelegramMiniApp } from "@/lib/clientPlatform";

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
  const linked = useRef(false);
  const isTelegram = isTelegramMiniApp();

  useEffect(() => {
    if (!isTelegram || !authenticated || linked.current) return;

    // Check if Telegram is already linked
    const hasTelegram = user?.linkedAccounts?.some(
      (a) => a.type === "telegram",
    );
    if (hasTelegram) {
      linked.current = true;
      return;
    }

    // Link Telegram account using launch params
    // Must happen within 5 minutes of app launch (Telegram security constraint)
    async function link() {
      try {
        const { retrieveRawInitData } = await import("@telegram-apps/bridge");
        const initDataRaw = retrieveRawInitData() ?? "";
        linkTelegram({ launchParams: { initDataRaw } });
        linked.current = true;
      } catch {
        // Linking may fail if already linked or params expired — safe to ignore
      }
    }

    link();
  }, [isTelegram, authenticated, user, linkTelegram]);

  return { isTelegram };
}

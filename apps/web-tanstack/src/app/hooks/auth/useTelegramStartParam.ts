import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@/router/react-router";
import { normalizeMatchId } from "../../lib/matchIds";
import { isTelegramMiniApp } from "./useTelegramAuth";

export function extractMatchIdFromStartParam(startParam: string | null | undefined): string | null {
  if (!startParam) return null;
  const trimmed = startParam.trim();
  if (!trimmed.startsWith("m_")) return null;
  return normalizeMatchId(trimmed.slice(2));
}

export function readTelegramStartParam(): string | null {
  if (typeof window === "undefined") return null;

  const telegramUnsafe = (window as any)?.Telegram?.WebApp?.initDataUnsafe;
  if (telegramUnsafe && typeof telegramUnsafe.start_param === "string") {
    return telegramUnsafe.start_param;
  }

  const url = new URL(window.location.href);
  const fromQuery =
    url.searchParams.get("tgWebAppStartParam") ?? url.searchParams.get("startapp");
  return fromQuery?.trim() ? fromQuery : null;
}

export function useTelegramStartParamRouting() {
  const navigate = useNavigate();
  const location = useLocation();
  const routed = useRef(false);

  useEffect(() => {
    if (routed.current) return;
    if (!isTelegramMiniApp()) return;

    const matchId = extractMatchIdFromStartParam(readTelegramStartParam());
    if (!matchId) return;

    const targetPath = `/play/${matchId}`;
    const alreadyTarget =
      location.pathname === targetPath && new URLSearchParams(location.search).get("autojoin") === "1";
    if (alreadyTarget) {
      routed.current = true;
      return;
    }

    routed.current = true;
    navigate(`${targetPath}?autojoin=1`, { replace: true });
  }, [location.pathname, location.search, navigate]);
}

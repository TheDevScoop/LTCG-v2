export const CLIENT_PLATFORMS = [
  "web",
  "telegram",
  "discord",
  "embedded",
  "agent",
  "cpu",
  "unknown",
] as const;

export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

const DISCORD_ACTIVITY_QUERY_KEYS = [
  "frame_id",
  "instance_id",
  "guild_id",
  "channel_id",
];

export function isTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  // Telegram injects this object when running as a Mini App.
  return Boolean((window as any).Telegram?.WebApp?.initData);
}

export function isDiscordActivityFrame(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return DISCORD_ACTIVITY_QUERY_KEYS.some((key) => params.has(key));
}

export function detectClientPlatform(): ClientPlatform {
  if (isTelegramMiniApp()) return "telegram";
  if (isDiscordActivityFrame()) return "discord";
  return "web";
}

export function describeClientPlatform(): string {
  if (typeof window === "undefined") return "ssr";
  if (isTelegramMiniApp()) return "telegram-mini-app";
  if (isDiscordActivityFrame()) return "discord-activity";
  const isEmbedded = window.self !== window.top;
  return isEmbedded ? "embedded-webview" : "browser";
}

export function formatPlatformTag(platform: string | null | undefined): string | null {
  switch (platform) {
    case "discord":
      return "Discord";
    case "telegram":
      return "Telegram";
    case "web":
      return "Web";
    case "embedded":
      return "Embedded";
    case "agent":
      return "Agent";
    case "cpu":
      return "CPU";
    default:
      return null;
  }
}

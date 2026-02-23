import { join } from "node:path";
import { appendTimeline } from "./report";

type Playwright = typeof import("playwright");

function normalizeWebUrl(url: string) {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function withEmbeddedParam(url: string) {
  const u = new URL(url);
  if (!u.searchParams.get("embedded")) {
    u.searchParams.set("embedded", "true");
  }
  return u.toString();
}

function normalizeQueryValue(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type BrowserOverlayQuery = {
  apiKey?: string | null;
  hostId?: string | null;
  matchId?: string | null;
  seat?: "host" | "away" | null;
};

export type BrowserObserver = {
  open(query?: BrowserOverlayQuery): Promise<void>;
  snapshot(): Promise<unknown | null>;
  screenshot(name: string): Promise<string | null>;
  close(): Promise<void>;
};

export async function createBrowserObserver(args: {
  webUrl: string;
  apiKey: string;
  artifactsDir: string;
  timelinePath: string;
}): Promise<BrowserObserver> {
  const webUrl = normalizeWebUrl(args.webUrl);
  const artifactsDir = args.artifactsDir;
  const timelinePath = args.timelinePath;

  const playwright = (await import("playwright")) as Playwright;
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  async function open(query?: BrowserOverlayQuery) {
    const params = new URLSearchParams();
    const apiKey = normalizeQueryValue(query?.apiKey) ?? args.apiKey;
    const hostId = normalizeQueryValue(query?.hostId);
    const matchId = normalizeQueryValue(query?.matchId);
    if (apiKey) params.set("apiKey", apiKey);
    if (hostId) params.set("hostId", hostId);
    if (matchId) params.set("matchId", matchId);
    if (query?.seat === "host" || query?.seat === "away") {
      params.set("seat", query.seat);
    }

    // Load the stream overlay page directly — selector via query params, no postMessage needed.
    const overlayUrl = withEmbeddedParam(`${webUrl}/stream-overlay?${params.toString()}`);
    await appendTimeline(timelinePath, { type: "note", message: `browser_open url=${overlayUrl}` });
    await page.goto(overlayUrl, { waitUntil: "domcontentloaded" });

    // Wait until the spectator snapshot hook is present.
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15_000) {
      const ready = await page.evaluate(() => typeof window.render_spectator_to_text === "function");
      if (ready) return;
      await page.waitForTimeout(100);
    }
    throw new Error("Spectator snapshot hook not available (render_spectator_to_text).");
  }

  async function snapshot() {
    const text = await page.evaluate(() => window.render_spectator_to_text?.() ?? null);
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  async function screenshot(name: string) {
    const safe = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const path = join(artifactsDir, `${safe}.png`);
    try {
      await page.screenshot({ path, fullPage: true });
      await appendTimeline(timelinePath, { type: "note", message: `screenshot ${safe}.png` });
      return path;
    } catch {
      return null;
    }
  }

  async function close() {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return { open, snapshot, screenshot, close };
}

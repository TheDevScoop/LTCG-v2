/**
 * Vercel Blob image URLs
 * All static images are served from Vercel Blob storage.
 * Use `blob()` for dynamic paths or import specific constants.
 */

import { isDiscordActivityFrame } from "./clientPlatform";

const VERCEL_BLOB_BASE =
  "https://ubssmtksaikjji5g.public.blob.vercel-storage.com/lunchtable/lunchtable";

// Discord Activities run behind a restrictive CSP (discordsays.com proxy). Using the
// local `public/lunchtable/*` assets avoids blocked external image hosts and keeps
// the Activity from looking like a broken/blank frame.
const PUBLIC_ASSET_BASE = "/lunchtable";

function resolveBlobBase(): string {
  if (typeof window === "undefined") return VERCEL_BLOB_BASE;
  return isDiscordActivityFrame() ? PUBLIC_ASSET_BASE : VERCEL_BLOB_BASE;
}

const BLOB_BASE = resolveBlobBase();

/** Resolve a blob URL from a relative path (e.g. "logo.png", "vices/crypto.png") */
export function blob(path: string): string {
  return `${BLOB_BASE}/${path}`;
}

// ── Branding ──────────────────────────────────────────────
export const LOGO = blob("logo.png");
export const TITLE = blob("title.png");
export const FAVICON = blob("../favicon.png"); // one level up

// ── Backgrounds ───────────────────────────────────────────
export const LANDING_BG = blob("landing-bg.jpg");
export const LANDING_BG_PNG = blob("landing-bg.png");
export const STORY_BG = blob("story-bg.png");
export const STAGES_BG = blob("stagesbg.png");
export const COLLECTION_BG = blob("collection-bg.png");
export const DECK_BG = blob("deck-bg.png");
export const WATCH_BG = blob("watch-bg.png");
export const TTG_BG = blob("TTG.png");
export const PVP_BG = blob("pvp.png");
export const STREAM_BG = blob("stream-bg.png");
export const PRIVACY_BG = blob("privacy-bg.png");
export const MENU_TEXTURE = blob("menu-texture.png");
export const CRUMPLED_PAPER = blob("crumpled-paper.png");

// ── Navigation ────────────────────────────────────────────
export const NAV_BACK = blob("back.png");
export const NAV_HOME = blob("home.png");
export const NAV_LOGIN = blob("login.png");

// ── Decorative ────────────────────────────────────────────
export const INK_FRAME = blob("ink-frame.png");
export const TAPE = blob("tape.png");
export const DECO_PILLS = blob("deco-pills.png");
export const DECO_SHIELD = blob("deco-shield.png");
export const RETRO_TV = blob("retro-tv.png");
export const MUSIC_BUTTON = blob("music-button.png");
export const STREAM_OVERLAY = blob("stream-overlay.png");
export const CIGGARETTE_TRAY = blob("ciggarette-tray.png");

// ── Characters ────────────────────────────────────────────
export const MILUNCHLADY_PFP = blob("milunchladypfp.png");
export const MILUNCHLADY_CLASSIC = blob("milunchlady-classic.png");
export const MILUNCHLADY_GOTH = blob("milunchlady-goth.png");
export const MILUNCHLADY_CYBER = blob("milunchlady-cyber.png");
export const MILUNCHLADY_HYPEBEAST = blob("milunchlady-hypebeast.png");
export const MILUNCHLADY_PREP = blob("milunchlady-prep.png");
export const MILUNCHLADY_GAMER = blob("milunchlady-gamer.png");

// ── Story ────────────────────────────────────────────────
export const STORY_FIRSTDAY = blob("firstday.png");
export const HOMEWORK_LABEL = blob("homework.png");
export const QUESTIONS_LABEL = blob("questions.png");

// ── Story Chapter Art ────────────────────────────────────
export const STORY_1_1 = blob("story/story-1-1.png");
export const STORY_1_2 = blob("story/story-1-2.png");
export const STORY_1_3 = blob("story/story-1-3.png");
export const STORY_1_4 = blob("story/story-1-4.png");

export const STORY_2_1 = blob("story/story-2-1.png");
export const STORY_2_2 = blob("story/story-2-2.png");
export const STORY_2_3 = blob("story/story-2-3.png");
export const STORY_2_4 = blob("story/story-2-4.png");

export const STORY_3_1 = blob("story/story-3-1.png");
export const STORY_3_2 = blob("story/story-3-2.png");
export const STORY_3_3 = blob("story/story-3-3.png");
export const STORY_3_4 = blob("story/story-3-4.png");

export const STORY_4_1 = blob("story/story-4-1.png");
export const STORY_4_2 = blob("story/story-4-2.png");
export const STORY_4_3 = blob("story/story-4-3.png");
export const STORY_4_4 = blob("story/story-4-4.png");

// ── About Page Comics ─────────────────────────────────────
export const ABOUT_1_CONCEPT = blob("about/about-1-concept.png");
export const ABOUT_2_CARDS = blob("about/about-2-cards.png");
export const ABOUT_3_STREAM = blob("about/about-3-stream.png");
export const ABOUT_4_PLATFORM = blob("about/about-4-platform.png");

// ── Stage Banners ─────────────────────────────────────────
export const STAGE_1_1_1 = blob("stages/stage-1-1-1.png");
export const STAGE_1_1_2 = blob("stages/stage-1-1-2.png");
export const STAGE_1_1_3 = blob("stages/stage-1-1-3.png");

// ── Platforms ─────────────────────────────────────────────
export const MILUNCHLADY_PFP_AGENT = blob("milunchlaidypfp.png");
export const OPENCLAWD_PFP = blob("openclawdpfp.png");

// ── Vices ─────────────────────────────────────────────────
export const VICE_SPLASH = blob("vices/vice-splash.png");
export const VICE_COUNTER = blob("vices/vice-counter.png");

// ── Comic Bubbles ────────────────────────────────────────
export const BUBBLE_SPEECH = blob("2.png");
export const BUBBLE_BURST = blob("3.png");
export const BUBBLE_CHAT_STACK = blob("4.png");
export const BUBBLE_WAVY = blob("5.png");

// ── Game Board Assets ────────────────────────────────────
export const PLAYMAT = blob("game-assets/board/playmat.png");
export const CARD_BACK = blob("game-assets/frames/card-back.png");
export const FRAME_MONSTER = blob("game-assets/frames/frame-monster.png");
export const FRAME_SPELL = blob("game-assets/frames/frame-spell.png");
export const FRAME_TRAP = blob("game-assets/frames/frame-trap.png");
export const FRAME_ENVIRONMENT = blob("game-assets/frames/frame-environment.png");

// ── Board Zone Assets ────────────────────────────────────
export const BOARD_CARD_FRAME_MONSTER = blob("game-assets/board/card-frame-monster.png");
export const BOARD_CARD_FRAME_SPELL = blob("game-assets/board/card-frame-spell.png");
export const BOARD_CARD_FRAME_TRAP = blob("game-assets/board/card-frame-trap.png");
export const ZONE_GLOW_RED = blob("game-assets/board/zone-glow-red.png");

// ── Card Art ─────────────────────────────────────────────
/** Resolve a card art image by filename (e.g. "afterparty_goblin.png") */
export function cardArtBlob(filename: string): string {
  return blob(`game-assets/cards/${filename}`);
}

// ── 3D Models ────────────────────────────────────────────
export const SOLO_CUP_GLTF = blob("solo-cup/scene.gltf");

// ── Secret Backgrounds ───────────────────────────────────
export const COLLECTION_BG_SECRET = blob("collection-bg-secret.png");
export const DECK_BG_SECRET = blob("deck-bg-secret.png");
export const LANDING_BG_SECRET = blob("landing-bg-secret.png");

/** Get a vice image by slug (e.g. "crypto", "gambling") */
export function viceImage(slug: string): string {
  return blob(`vices/${slug}.png`);
}

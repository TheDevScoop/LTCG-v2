/**
 * Maps card names (lowercased, trimmed) to art image paths in Vercel Blob.
 * Falls back to undefined when no art exists — callers show the archetype gradient instead.
 */
import {
  cardArtBlob,
  FRAME_MONSTER,
  FRAME_SPELL,
  FRAME_TRAP,
  FRAME_ENVIRONMENT,
  CARD_BACK,
  PLAYMAT,
} from "./blobUrls";

const ART_MAP: Record<string, string> = {
  "afterparty goblin": cardArtBlob("afterparty_goblin.png"),
  "attendance award annie": cardArtBlob("attendance_award_annie.png"),
  "back alley bookie": cardArtBlob("back_alley_bookie.png"),
  "corporate ladder chad": cardArtBlob("corporate_ladder_chad.png"),
  "debate team captain": cardArtBlob("debate_team_captain.png"),
  "debugging dana": cardArtBlob("debugging_dana.png"),
};

/** Frame images by card type */
export const FRAME_MAP: Record<string, string> = {
  stereotype: FRAME_MONSTER,
  monster: FRAME_MONSTER,
  spell: FRAME_SPELL,
  trap: FRAME_TRAP,
  environment: FRAME_ENVIRONMENT,
  field: FRAME_ENVIRONMENT,
};

/** Card back texture path */
export const CARD_BACK_PATH = CARD_BACK;

/** Playmat texture path */
export const PLAYMAT_PATH = PLAYMAT;

export function getCardArt(name?: string): string | undefined {
  if (!name) return undefined;
  return ART_MAP[name.toLowerCase().trim()];
}

export function getCardFrame(cardType?: string): string {
  if (!cardType) return FRAME_MAP.stereotype!;
  return FRAME_MAP[cardType.toLowerCase()] ?? FRAME_MAP.stereotype!;
}

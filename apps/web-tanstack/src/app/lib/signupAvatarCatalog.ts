import {blob} from "@/lib/blobUrls";

export const SIGNUP_AVATAR_IDS = [
  "avatar-001",
  "avatar-002",
  "avatar-003",
  "avatar-004",
  "avatar-005",
  "avatar-006",
  "avatar-007",
  "avatar-008",
  "avatar-009",
  "avatar-010",
  "avatar-011",
  "avatar-012",
  "avatar-013",
  "avatar-014",
  "avatar-015",
  "avatar-016",
  "avatar-017",
  "avatar-018",
  "avatar-019",
  "avatar-020",
  "avatar-021",
  "avatar-022",
  "avatar-023",
  "avatar-024",
  "avatar-025",
  "avatar-026",
  "avatar-027",
  "avatar-028",
  "avatar-029",
] as const;

export type SignupAvatarId = (typeof SIGNUP_AVATAR_IDS)[number];
export type SignupAvatarPath = `avatars/signup/${SignupAvatarId}.png`;

export type SignupAvatarOption = {
  id: SignupAvatarId;
  path: SignupAvatarPath;
  url: string;
};

export const DEFAULT_SIGNUP_AVATAR_ID: SignupAvatarId = "avatar-001";
export const DEFAULT_SIGNUP_AVATAR_PATH: SignupAvatarPath =
  `avatars/signup/${DEFAULT_SIGNUP_AVATAR_ID}.png`;

const toAvatarPath = (id: SignupAvatarId): SignupAvatarPath =>
  `avatars/signup/${id}.png`;

export const SIGNUP_AVATAR_OPTIONS: readonly SignupAvatarOption[] = SIGNUP_AVATAR_IDS.map(
  (id) => {
    const path = toAvatarPath(id);
    return {
      id,
      path,
      url: blob(path),
    };
  },
);

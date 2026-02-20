import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useConvexAuth } from "convex/react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { blob } from "@/lib/blobUrls";
import { useAudio } from "@/components/audio/AudioProvider";
import { TrayNav } from "@/components/layout/TrayNav";
import { captureError, trackEvent } from "@/lib/telemetry";
import {
  DEFAULT_SIGNUP_AVATAR_PATH,
  SIGNUP_AVATAR_OPTIONS,
  type SignupAvatarPath,
} from "@/lib/signupAvatarCatalog";

type SettingsUser = {
  username: string;
  avatarPath?: string;
  email?: string;
};

const USERNAME_HELP = "3-20 characters. Use letters, numbers, underscores only.";
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function PercentBar({ value, onChange, label, muted }: {
  value: number;
  label: string;
  muted: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-black uppercase tracking-wide mb-2" htmlFor={`volume-${label}`}>
        {label} ({Math.round(value * 100)}%)
      </label>
      <div className="flex items-center gap-3">
        <input
          id={`volume-${label}`}
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onChange(Number(event.target.value) / 100);
          }}
          className="w-full zine-slider"
        />
        <span
          className={`text-xs px-2 py-1 border border-[#121212] ${muted
            ? "text-[#b91c1c]"
            : "text-[#444]"}`}
        >
          {muted ? "Muted" : "Active"}
        </span>
      </div>
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    isAuthenticated ? {} : "skip",
  ) as SettingsUser | null | undefined;

  const setUsernameMutation = useConvexMutation(apiAny.auth.setUsername);
  const setAvatarPathMutation = useConvexMutation(apiAny.auth.setAvatarPath);

  const { settings, setMusicVolume, setSfxVolume, setMusicMuted, setSfxMuted } = useAudio();

  const [username, setUsername] = useState("");
  const [avatarPath, setAvatarPath] = useState<SignupAvatarPath>(DEFAULT_SIGNUP_AVATAR_PATH);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const currentUserLoaded = currentUser !== undefined && currentUser !== null;

  const validUsername = useMemo(
    () => USERNAME_PATTERN.test(username.trim()),
    [username],
  );

  const selectedAvatarUrl = useMemo(() => {
    const option = SIGNUP_AVATAR_OPTIONS.find((item) => item.path === avatarPath);
    return option?.url ?? blob(DEFAULT_SIGNUP_AVATAR_PATH);
  }, [avatarPath]);

  useEffect(() => {
    if (!currentUser) return;
    setUsername(currentUser.username);
    const availablePath = SIGNUP_AVATAR_OPTIONS.some(
      (option) => option.path === currentUser.avatarPath,
    )
      ? currentUser.avatarPath
      : undefined;
    setAvatarPath((availablePath as SignupAvatarPath | undefined) ?? DEFAULT_SIGNUP_AVATAR_PATH);
  }, [currentUser]);

  const handleSaveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = username.trim();
    if (!USERNAME_PATTERN.test(trimmed)) {
      toast.error(USERNAME_HELP);
      return;
    }

    if (!currentUser) return;
    if (trimmed === currentUser.username) {
      toast.message("Username unchanged.");
      return;
    }

    setSavingUsername(true);
    try {
      await setUsernameMutation({ username: trimmed });
      toast.success("Username saved.");
      setSaved("username");
      setTimeout(() => setSaved(null), 2000);
      trackEvent("settings_username_saved", {
        username: trimmed,
        action: "save_username",
      });
    } catch (err: unknown) {
      captureError(err, { action: "save_username", username: trimmed });
      const message = err instanceof Error ? err.message : "Could not save username.";
      toast.error(message);
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveAvatar = async () => {
    if (!currentUser) return;
    if (avatarPath === currentUser.avatarPath) {
      toast.message("Avatar unchanged.");
      return;
    }

    setSavingAvatar(true);
    try {
      await setAvatarPathMutation({ avatarPath });
      toast.success("Avatar saved.");
      setSaved("avatar");
      setTimeout(() => setSaved(null), 2000);
      trackEvent("settings_avatar_saved", {
        avatarPath,
        action: "save_avatar",
      });
    } catch (err: unknown) {
      captureError(err, { action: "save_avatar", avatarPath });
      const message = err instanceof Error ? err.message : "Could not save avatar.";
      toast.error(message);
    } finally {
      setSavingAvatar(false);
    }
  };

  if (!currentUserLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-10 h-10 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#fdfdfb] px-6 py-10">
        <div className="paper-panel p-8 text-center max-w-md mx-auto">
          <h1
            className="text-2xl font-black uppercase tracking-tighter mb-3"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            User Record Missing
          </h1>
          <p
            className="text-[#666] text-sm mb-6"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Your account is still being synced. If this persists, sign out and back in.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="tcg-button px-5 py-2.5"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#fdfdfb] px-4 py-10 pb-24">
      <style>{`
        .zine-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          background: #121212;
          outline: none;
          border: 2px solid #121212;
        }
        .zine-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: #ffcc00;
          border: 2px solid #121212;
          cursor: pointer;
        }
        .zine-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #ffcc00;
          border: 2px solid #121212;
          cursor: pointer;
          border-radius: 0;
        }
        .zine-slider::-webkit-slider-runnable-track {
          height: 6px;
          background: #121212;
        }
        .zine-slider::-moz-range-track {
          height: 6px;
          background: #121212;
        }
      `}</style>
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center">
          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="text-4xl md:text-5xl tracking-tighter uppercase"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            Settings
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-[#666] mt-2"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Edit profile details and tune your in-app experience.
          </motion.p>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="mt-5 tcg-button px-6 py-2.5"
          >
            Back to Profile
          </button>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="paper-panel p-6 md:p-8 space-y-6"
        >
          <h2
            className="text-xl font-black uppercase tracking-wide"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            Profile
          </h2>

          <form onSubmit={handleSaveUsername} className="space-y-3">
            <label htmlFor="settings-username" className="block text-sm font-black uppercase tracking-wide">
              Username
            </label>
            <div className="max-w-lg">
              <input
                id="settings-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="LunchTablePlayer"
                className="w-full px-4 py-2.5 border-2 border-[#121212] bg-white text-[#121212] text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#ffcc00]"
                maxLength={20}
              />
              <p className="text-xs text-[#666] mt-1" style={{ fontFamily: "Special Elite, cursive" }}>
                {USERNAME_HELP}
              </p>
            </div>

            <div className="flex items-center">
              <button
                type="submit"
                disabled={savingUsername || !validUsername || username.trim() === currentUser.username}
                className="tcg-button px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {savingUsername ? "Saving..." : "Save Username"}
              </button>
              <AnimatePresence>
                {saved === "username" && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="inline-block ml-2 text-green-600 font-black"
                  >
                    &#10003;
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </form>

          <div className="space-y-3 pt-2">
            <p className="text-sm font-black uppercase tracking-wide">Email</p>
            <p className="text-sm text-[#666]">{currentUser.email ?? "Not set"}</p>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-black uppercase tracking-wide">Avatar</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <img
                src={selectedAvatarUrl}
                alt="Selected avatar"
                className="w-24 h-24 border-2 border-[#121212]"
                loading="lazy"
              />
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={savingAvatar || avatarPath === currentUser.avatarPath}
                  className="tcg-button px-4 py-2 text-sm disabled:opacity-50"
                >
                  {savingAvatar ? "Saving..." : "Save Avatar"}
                </button>
                <AnimatePresence>
                  {saved === "avatar" && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="inline-block ml-2 text-green-600 font-black"
                    >
                      &#10003;
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {SIGNUP_AVATAR_OPTIONS.map((option) => {
                const selected = option.path === avatarPath;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAvatarPath(option.path)}
                    aria-pressed={selected}
                    className={`border-2 p-1 transition ${selected ? "border-[#ffcc00]" : "border-transparent"}`}
                  >
                    <img
                      src={option.url}
                      alt={option.id}
                      className="w-16 h-16"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="paper-panel p-6 md:p-8 space-y-6"
        >
          <h2
            className="text-xl font-black uppercase tracking-wide"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            Audio
          </h2>
          <p
            className="text-sm text-[#666]"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Audio preferences are saved on this device.
          </p>

          <div className="space-y-5">
            <PercentBar
              label="Music Volume"
              value={settings.musicVolume}
              muted={settings.musicMuted}
              onChange={setMusicVolume}
            />
            <button
              type="button"
              onClick={() => setMusicMuted(!settings.musicMuted)}
              className="tcg-button px-4 py-2.5 text-sm"
            >
              {settings.musicMuted ? "Unmute Music" : "Mute Music"}
            </button>

            <PercentBar
              label="SFX Volume"
              value={settings.sfxVolume}
              muted={settings.sfxMuted}
              onChange={setSfxVolume}
            />
            <button
              type="button"
              onClick={() => setSfxMuted(!settings.sfxMuted)}
              className="tcg-button px-4 py-2.5 text-sm"
            >
              {settings.sfxMuted ? "Unmute SFX" : "Mute SFX"}
            </button>
          </div>
        </motion.section>
      </div>

      <TrayNav />
    </main>
  );
}

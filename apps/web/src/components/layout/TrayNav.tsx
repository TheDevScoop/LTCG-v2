import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { usePrivy, useLogout } from "@privy-io/react-auth";
import { storeRedirect } from "@/hooks/auth/usePostLoginRedirect";
import { LOGO, DECO_PILLS, DECO_SHIELD, MENU_TEXTURE } from "@/lib/blobUrls";

const textLinks: Array<
  { label: string; path: string; auth: boolean } | { label: string; href: string }
> = [
  { label: "Agent Dev", path: "/agent-dev", auth: true },
  { label: "Leaderboard", path: "/leaderboard", auth: false },
  { label: "Docs", path: "/about", auth: false },
  { label: "X / Twitter", href: "https://x.com/LunchTableTCG" },
  { label: "Discord", href: import.meta.env.VITE_DISCORD_URL || "#" },
];

/**
 * Shared bottom tray navigation.
 * Renders a floating logo button + slide-up off-canvas menu.
 * Use on every public page as the primary nav.
 *
 * @param invert - invert the logo color (true for dark backgrounds)
 */
export function TrayNav({ invert = true }: { invert?: boolean }) {
  const navigate = useNavigate();
  const { authenticated, login } = usePrivy();
  const { logout } = useLogout({
    onSuccess: () => {
      sessionStorage.removeItem("ltcg_redirect");
      navigate("/");
    },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    setMenuOpen(false);
    await logout();
    setLoggingOut(false);
  }, [logout]);

  const goTo = useCallback(
    (path: string, requiresAuth: boolean) => {
      if (requiresAuth && !authenticated) {
        storeRedirect(path);
        login();
        return;
      }
      setMenuOpen(false);
      navigate(path);
    },
    [authenticated, login, navigate],
  );

  return (
    <>
      {/* Floating logo button */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <img
            src={LOGO}
            alt="Menu"
            className={`h-10 w-10 drop-shadow-[2px_2px_0px_rgba(0,0,0,0.8)] ${invert ? "invert" : ""}`}
            draggable={false}
          />
        </button>
      </div>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
          menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Off-canvas tray menu */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out ${
          menuOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Torn paper top edge */}
        <div
          className="h-4 w-full"
          style={{
            background: "transparent",
            clipPath:
              "polygon(0% 100%, 2% 40%, 5% 80%, 8% 30%, 11% 70%, 14% 20%, 17% 60%, 20% 35%, 23% 75%, 26% 25%, 29% 65%, 32% 40%, 35% 80%, 38% 30%, 41% 70%, 44% 20%, 47% 55%, 50% 35%, 53% 75%, 56% 25%, 59% 60%, 62% 40%, 65% 80%, 68% 30%, 71% 65%, 74% 20%, 77% 55%, 80% 35%, 83% 75%, 86% 25%, 89% 60%, 92% 40%, 95% 70%, 98% 30%, 100% 100%)",
            backgroundImage: `url('${MENU_TEXTURE}')`,
            backgroundSize: "100% 100%",
          }}
        />

        {/* Menu body */}
        <div
          className="relative px-6 pt-2 pb-8"
          style={{
            backgroundImage: `url('${MENU_TEXTURE}')`,
            backgroundSize: "cover",
            backgroundPosition: "center top",
          }}
        >
          {/* Dim overlay for readability */}
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />

          {/* Drag handle */}
          <div className="relative flex justify-center mb-3">
            <div className="w-12 h-1 bg-white/40 rounded-full" />
          </div>

          {/* Image nav row */}
          <div className="relative flex items-end justify-center gap-4 md:gap-6 mb-4 px-2">
            {/* Home */}
            <button
              onClick={() => { setMenuOpen(false); navigate("/"); }}
              className="tray-icon-btn relative group"
              title="Home"
            >
              <img
                src={LOGO}
                alt="Home"
                className="h-20 md:h-16 w-auto brightness-110 contrast-110 hover:brightness-125 transition-all drop-shadow-[0_2px_12px_rgba(255,255,255,0.5)]"
                draggable={false}
              />
              <span className="tray-tooltip">Home</span>
            </button>

            {/* Pill bottle → $LUNCH / Token */}
            <button
              onClick={() => { setMenuOpen(false); navigate("/token"); }}
              className="tray-icon-btn relative group"
              title="$LUNCH"
            >
              <img
                src={DECO_PILLS}
                alt="$LUNCH"
                className="h-20 md:h-16 w-auto brightness-110 contrast-110 hover:brightness-125 transition-all drop-shadow-[0_2px_12px_rgba(255,255,255,0.5)]"
                draggable={false}
                loading="lazy"
              />
              <span className="tray-tooltip">$LUNCH</span>
            </button>

            {/* Shield/Anchor → Legal */}
            <button
              onClick={() => { setMenuOpen(false); navigate("/privacy"); }}
              className="tray-icon-btn relative group"
              title="Legal"
            >
              <img
                src={DECO_SHIELD}
                alt="Privacy & Legal"
                className="h-20 md:h-16 w-auto brightness-110 contrast-110 hover:brightness-125 transition-all drop-shadow-[0_2px_12px_rgba(255,255,255,0.5)]"
                draggable={false}
                loading="lazy"
              />
              <span className="tray-tooltip">Legal</span>
            </button>
          </div>

          {/* Desktop: Legal sub-links */}
          <div className="relative hidden md:flex justify-center gap-4 mb-3">
            {[
              { label: "Privacy Policy", path: "/privacy" },
              { label: "Terms of Service", path: "/terms" },
              { label: "About", path: "/about" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => { setMenuOpen(false); navigate(item.path); }}
                className="text-[clamp(0.65rem,1.5vw,0.8rem)] text-white/70 hover:text-white transition-colors uppercase tracking-wider font-bold"
                style={{ fontFamily: "Permanent Marker, cursive", textShadow: "1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000" }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="relative w-16 h-px bg-white/20 mx-auto mb-3" />

          {/* Text links */}
          <div className="relative flex flex-wrap justify-center gap-x-5 gap-y-1 max-w-md mx-auto">
            {textLinks.map((item) =>
              "href" in item ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 text-[clamp(1rem,2.5vw,1.25rem)] font-bold uppercase tracking-wider text-white hover:text-[#ffcc00] transition-colors"
                  style={{ fontFamily: "Permanent Marker, cursive", textShadow: "2px 2px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000" }}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  onClick={() => goTo(item.path, item.auth)}
                  className="px-2 py-1 text-[clamp(1rem,2.5vw,1.25rem)] font-bold uppercase tracking-wider text-white hover:text-[#ffcc00] transition-colors"
                  style={{ fontFamily: "Permanent Marker, cursive", textShadow: "2px 2px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000" }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>

          {/* Sign out */}
          {authenticated && (
            <>
              <div className="relative w-16 h-px bg-[#121212]/20 mx-auto my-3" />
              <div className="relative text-center">
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#e53e3e] hover:text-[#121212] transition-colors disabled:opacity-50"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {loggingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </>
          )}

          {/* Close hint */}
          <p
            className="relative text-center text-[clamp(0.6rem,1.2vw,0.75rem)] text-white/40 mt-3"
            style={{ fontFamily: "Special Elite, cursive", textShadow: "1px 1px 0 #000" }}
          >
            tap outside to close
          </p>
        </div>
      </div>
    </>
  );
}

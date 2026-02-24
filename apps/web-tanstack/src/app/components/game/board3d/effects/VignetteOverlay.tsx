/**
 * CSS-based vignette overlay for the 3D board.
 * Darkens edges of the viewport for cinematic focus on the center.
 * Rendered as a DOM element on top of the canvas (no GPU cost).
 */
export function VignetteOverlay() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 2,
        background:
          "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
      }}
    />
  );
}

/**
 * CSS scanline overlay for CRT/photocopier aesthetic.
 * Rendered on top of the canvas.
 */
export function CRTScanlines() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 2,
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        mixBlendMode: "multiply",
      }}
    />
  );
}

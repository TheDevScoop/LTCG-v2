import { useState, useCallback, useRef } from "react";
import { useCardTilt } from "@/hooks/useCardTilt";

interface CardTileProps {
  name: string;
  imageUrl: string;
  subtitle?: string;
  subtitleColor?: string;
  locked?: boolean;
  onClick?: () => void;
  className?: string;
  badge?: string;
}

export function CardTile({
  name,
  imageUrl,
  subtitle,
  subtitleColor = "#121212",
  locked = false,
  onClick,
  className = "",
  badge,
}: CardTileProps) {
  const { tiltStyle, onMouseMove, onMouseLeave } = useCardTilt({ maxTilt: 8 });

  // Track cursor position within the card for the holographic shine
  const [shinePos, setShinePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const animFrame = useRef(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (locked) return;

      // Delegate tilt tracking to the hook
      onMouseMove(e);

      // Track position for shine overlay
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      cancelAnimationFrame(animFrame.current);
      animFrame.current = requestAnimationFrame(() => {
        setShinePos({ x, y });
      });
    },
    [locked, onMouseMove],
  );

  const handleMouseLeave = useCallback(() => {
    if (locked) return;
    onMouseLeave();
    setIsHovered(false);
    setShinePos({ x: 50, y: 50 });
  }, [locked, onMouseLeave]);

  const handleMouseEnter = useCallback(() => {
    if (!locked) setIsHovered(true);
  }, [locked]);

  const isClickable = !!onClick && !locked;

  return (
    <div
      style={{ perspective: "800px" }}
      className={className}
    >
      <div
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={isClickable ? onClick : undefined}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        style={{
          aspectRatio: "3 / 4",
          transform: locked
            ? "none"
            : `rotateX(${tiltStyle.rotateX}deg) rotateY(${tiltStyle.rotateY}deg) ${
                isHovered ? "translate(-2px, -2px)" : ""
              }`,
          transition:
            "transform 0.15s ease-out, box-shadow 0.15s ease-out, filter 0.15s ease-out",
          boxShadow: isHovered && !locked
            ? "8px 8px 0px 0px rgba(18,18,18,1)"
            : "4px 4px 0px 0px rgba(18,18,18,1)",
          border: "2px solid #121212",
          filter: locked ? "grayscale(100%)" : "none",
          opacity: locked ? 0.4 : 1,
          position: "relative",
          overflow: "hidden",
          cursor: isClickable ? "pointer" : locked ? "not-allowed" : "default",
          display: "flex",
          flexDirection: "column",
          transformStyle: "preserve-3d",
          willChange: locked ? "auto" : "transform",
        }}
      >
        {/* Card image — covers full card */}
        <img
          src={imageUrl}
          alt={name}
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            userSelect: "none",
          }}
        />

        {/* Badge — top-right corner */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              backgroundColor: "#121212",
              color: "#fdfdfb",
              fontFamily: "Outfit, Inter, sans-serif",
              fontWeight: 900,
              fontSize: "0.625rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "2px 6px",
              border: "1.5px solid #fdfdfb",
              boxShadow: "2px 2px 0px 0px rgba(18,18,18,1)",
              lineHeight: 1.4,
              zIndex: 20,
              pointerEvents: "none",
            }}
          >
            {badge}
          </div>
        )}

        {/* Bottom name + subtitle overlay */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background:
              "linear-gradient(to top, rgba(18,18,18,0.95) 0%, rgba(18,18,18,0.7) 60%, transparent 100%)",
            padding: "16px 8px 8px",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          {subtitle && (
            <p
              style={{
                fontFamily: "Outfit, Inter, sans-serif",
                fontWeight: 700,
                fontSize: "0.5rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: subtitleColor,
                marginBottom: "2px",
                lineHeight: 1,
              }}
            >
              {subtitle}
            </p>
          )}
          <p
            style={{
              fontFamily: "Outfit, Inter, sans-serif",
              fontWeight: 900,
              fontSize: "0.75rem",
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              color: "#fdfdfb",
              lineHeight: 1.1,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {name}
          </p>
        </div>

        {/* Holographic shine overlay — follows cursor, only when hovered */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 30,
            background: isHovered && !locked
              ? `radial-gradient(circle at ${shinePos.x}% ${shinePos.y}%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 35%, transparent 65%)`
              : "none",
            transition: "background 0.05s linear",
            mixBlendMode: "screen",
          }}
        />

        {/* Halftone zine texture */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 10,
            opacity: 0.04,
            backgroundImage: "radial-gradient(circle, #fff 0.4px, transparent 0.4px)",
            backgroundSize: "4px 4px",
          }}
        />

        {/* Locked overlay indicator */}
        {locked && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 40,
              background: "rgba(18,18,18,0.15)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fdfdfb"
              strokeWidth="2.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
              style={{ opacity: 0.7 }}
              aria-label="Locked"
            >
              <rect x="3" y="11" width="18" height="11" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

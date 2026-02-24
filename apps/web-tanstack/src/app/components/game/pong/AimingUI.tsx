import { useState, useRef, useCallback } from "react";

interface AimingUIProps {
  cardName: string;
  mode: "combat" | "redemption";
  onShoot: (angle: number, power: number) => void;
  onDecline: () => void;
}

export function AimingUI({ cardName, mode, onShoot, onDecline }: AimingUIProps) {
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0);
  const [charging, setCharging] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directionRef = useRef(1);

  const startCharge = useCallback(() => {
    setCharging(true);
    directionRef.current = 1;
    intervalRef.current = setInterval(() => {
      setPower((prev) => {
        const next = prev + directionRef.current * 0.03;
        if (next >= 1) {
          directionRef.current = -1;
          return 1;
        }
        if (next <= 0) {
          directionRef.current = 1;
          return 0;
        }
        return next;
      });
    }, 30);
  }, []);

  const releaseCharge = useCallback(() => {
    setCharging(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onShoot(angle, power);
  }, [angle, power, onShoot]);

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto flex flex-col items-center justify-end pb-8">
      {/* Title */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center">
        <p className="font-['Outfit'] font-black text-2xl uppercase tracking-tighter text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          {mode === "combat" ? "PONG SHOT!" : "REDEMPTION SHOT!"}
        </p>
        <p className="font-['Special_Elite'] text-sm text-[#ffcc00] mt-1">
          {mode === "combat"
            ? `Sink it to banish "${cardName}"`
            : "Sink it to reset LP and keep playing!"}
        </p>
      </div>

      {/* Angle slider */}
      <div className="mb-4 w-64">
        <label className="block text-center text-[10px] text-white/60 uppercase tracking-wider mb-1">
          Aim
        </label>
        <input
          type="range"
          min={-100}
          max={100}
          value={angle * 100}
          onChange={(e) => setAngle(Number(e.target.value) / 100)}
          className="w-full accent-[#ffcc00]"
        />
      </div>

      {/* Power meter */}
      <div className="mb-6 flex items-center gap-3">
        <div className="relative w-8 h-32 border-2 border-white/40 bg-black/50 overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-75"
            style={{
              height: `${power * 100}%`,
              background: power > 0.7 ? "#ff4444" : power > 0.4 ? "#ffcc00" : "#33ccff",
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onPointerDown={startCharge}
            onPointerUp={releaseCharge}
            onPointerLeave={() => {
              if (charging) releaseCharge();
            }}
            className="tcg-button-primary px-6 py-3 text-sm font-black uppercase tracking-wider select-none"
          >
            {charging ? "RELEASE!" : "HOLD TO THROW"}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="text-[10px] text-white/40 hover:text-white/70 underline text-center"
          >
            {mode === "combat" ? "Skip (send to graveyard)" : "Accept defeat"}
          </button>
        </div>
      </div>
    </div>
  );
}

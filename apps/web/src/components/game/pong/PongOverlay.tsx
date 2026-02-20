import { Suspense, useState, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { SOLO_CUP_GLTF } from "@/lib/blobUrls";
import { PongBall } from "./PongBall";
import { AimingUI } from "./AimingUI";
import { simulatePongShot, type PongTrajectory } from "./pongPhysics";

interface PongOverlayProps {
  mode: "combat" | "redemption";
  cardName: string;
  onResult: (result: "sink" | "miss") => void;
  onDecline: () => void;
}

function CupModel() {
  const { scene } = useGLTF(SOLO_CUP_GLTF);
  return (
    <primitive
      object={scene.clone()}
      position={[0, 0.48, -2]}
      scale={[8, 8, 8]}
    />
  );
}

/** Procedural ping pong ball mesh for the scene (resting beside the cup) */
function TableDecor() {
  return (
    <>
      {/* Extra cups for atmosphere */}
      <mesh position={[-0.7, 0.15, -1.6]} rotation={[0.1, 0.3, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.3, 16]} />
        <meshStandardMaterial color="#cc2222" roughness={0.6} />
      </mesh>
      <mesh position={[0.8, 0.15, -2.3]} rotation={[-0.05, -0.2, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.3, 16]} />
        <meshStandardMaterial color="#cc2222" roughness={0.6} />
      </mesh>
    </>
  );
}

function PongScene({
  trajectory,
  onBallComplete,
}: {
  trajectory: PongTrajectory | null;
  onBallComplete: () => void;
}) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} castShadow />
      <pointLight position={[0, 2.5, -2]} intensity={1.0} color="#ffcc00" />
      <pointLight position={[0, 1, 3]} intensity={0.4} color="#ffffff" />

      {/* Table surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#1a2e1a" roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Table edge lines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, -2]}>
        <ringGeometry args={[0.5, 0.52, 32]} />
        <meshBasicMaterial color="#ffcc00" opacity={0.3} transparent />
      </mesh>

      {/* Cup target */}
      <Suspense fallback={
        <mesh position={[0, 0.4, -2]}>
          <cylinderGeometry args={[0.35, 0.2, 0.8, 16]} />
          <meshStandardMaterial color="#cc2222" roughness={0.5} />
        </mesh>
      }>
        <CupModel />
      </Suspense>

      {/* Decorative cups */}
      <TableDecor />

      {/* Ball */}
      <PongBall trajectory={trajectory} onComplete={onBallComplete} />
    </>
  );
}

export function PongOverlay({ mode, cardName, onResult, onDecline }: PongOverlayProps) {
  const [trajectory, setTrajectory] = useState<PongTrajectory | null>(null);
  const [phase, setPhase] = useState<"aiming" | "flying" | "result">("aiming");
  const resultRef = useRef<"sink" | "miss">("miss");

  const handleShoot = useCallback((angle: number, power: number) => {
    const traj = simulatePongShot(angle, power);
    resultRef.current = traj.hit ? "sink" : "miss";
    setTrajectory(traj);
    setPhase("flying");
  }, []);

  const handleBallComplete = useCallback(() => {
    setPhase("result");
    // Show result briefly, then notify parent
    setTimeout(() => {
      onResult(resultRef.current);
    }, 1200);
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-30">
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/85" />

      {/* R3F Canvas */}
      <Canvas
        camera={{
          position: [0, 2.2, 4],
          fov: 45,
          near: 0.1,
          far: 50,
        }}
        shadows
        style={{ position: "absolute", inset: 0 }}
      >
        <PongScene
          trajectory={trajectory}
          onBallComplete={handleBallComplete}
        />
      </Canvas>

      {/* Aiming UI overlay */}
      {phase === "aiming" && (
        <AimingUI
          cardName={cardName}
          mode={mode}
          onShoot={handleShoot}
          onDecline={onDecline}
        />
      )}

      {/* Result feedback */}
      {phase === "result" && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="text-center">
            <p
              className={`font-['Outfit'] font-black text-5xl uppercase tracking-tighter drop-shadow-[3px_3px_0px_rgba(0,0,0,1)] ${
                resultRef.current === "sink" ? "text-[#ffcc00]" : "text-white/60"
              }`}
            >
              {resultRef.current === "sink" ? "SUNK!" : "MISS!"}
            </p>
            <p className="font-['Special_Elite'] text-sm text-white/60 mt-2">
              {resultRef.current === "sink"
                ? mode === "combat"
                  ? "Card banished!"
                  : "LP reset! Game continues!"
                : mode === "combat"
                  ? "Card goes to graveyard"
                  : "Game over"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Preload the GLTF model
useGLTF.preload(SOLO_CUP_GLTF);

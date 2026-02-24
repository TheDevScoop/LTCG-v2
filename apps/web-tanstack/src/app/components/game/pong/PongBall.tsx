import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PongTrajectory } from "./pongPhysics";

interface PongBallProps {
  trajectory: PongTrajectory | null;
  onComplete: () => void;
}

export function PongBall({ trajectory, onComplete }: PongBallProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);

  // Reset refs when a new trajectory is set
  useEffect(() => {
    if (trajectory) {
      progressRef.current = 0;
      completedRef.current = false;
    }
  }, [trajectory]);

  useFrame((_, delta) => {
    if (!trajectory || !meshRef.current || completedRef.current) return;

    progressRef.current += delta / trajectory.duration;
    const t = Math.min(progressRef.current, 1);
    const index = Math.floor(t * (trajectory.points.length - 1));
    const point = trajectory.points[Math.min(index, trajectory.points.length - 1)];

    if (point) {
      meshRef.current.position.set(point[0], point[1], point[2]);
    }

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  });

  if (!trajectory) return null;

  return (
    <mesh ref={meshRef} position={[0, 0.5, 2.5]}>
      <sphereGeometry args={[0.06, 24, 24]} />
      <meshStandardMaterial
        color="#f8f8f0"
        roughness={0.15}
        metalness={0.05}
        emissive="#ffffff"
        emissiveIntensity={0.05}
      />
    </mesh>
  );
}

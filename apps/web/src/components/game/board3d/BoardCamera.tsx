import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

/**
 * Fixed camera looking down at ~55-60 degree angle, like Artifact.
 * Player's side is closer to camera, opponent's side further away.
 */
export function BoardCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 8, 5);
    camera.lookAt(new THREE.Vector3(0, 0, -0.5));
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

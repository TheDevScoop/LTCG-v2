export interface PongTrajectory {
  hit: boolean;
  points: [number, number, number][];
  duration: number;
}

// Cup opening position (top of the GLTF cup at scale [8,8,8], positioned at y=0.48)
const CUP_OPENING: [number, number, number] = [0, 0.96, -2];
const CUP_OPENING_RADIUS = 0.38;
const GRAVITY = 3.0; // Reduced for game-like floaty arc
const LAUNCH_Y = 0.5;
const LAUNCH_Z = 2.5;
const TOTAL_TIME = 1.0;
const STEPS = 60;

export function simulatePongShot(
  angle: number,
  power: number,
): PongTrajectory {
  // angle: -1 to 1 (horizontal offset), power: 0 to 1
  // At power ~0.5 and angle 0, ball arcs perfectly into the cup
  const powerFactor = 0.7 + power * 0.6; // 0.7 to 1.3 range

  // Z velocity: covers the throw distance, scaled by power
  const dz = CUP_OPENING[2] - LAUNCH_Z; // -4.5
  const vz = (dz / TOTAL_TIME) * powerFactor;

  // Y velocity: calculated so powerFactor=1.0 lands at cup opening
  const baseVy =
    (CUP_OPENING[1] - LAUNCH_Y + 0.5 * GRAVITY * TOTAL_TIME * TOTAL_TIME) /
    TOTAL_TIME;
  const vy = baseVy * powerFactor;

  // X velocity: angle controls horizontal aim
  const vx = angle * 2.0;

  const points: [number, number, number][] = [];
  const dt = TOTAL_TIME / STEPS;
  let finalHit = false;

  for (let i = 0; i <= STEPS; i++) {
    const t = i * dt;
    const x = vx * t;
    const y = LAUNCH_Y + vy * t - 0.5 * GRAVITY * t * t;
    const z = LAUNCH_Z + vz * t;
    points.push([x, Math.max(0, y), z]);

    // Check if ball crosses cup plane
    if (z <= CUP_OPENING[2] + 0.15 && z >= CUP_OPENING[2] - 0.15) {
      const dx = x - CUP_OPENING[0];
      const dy = y - CUP_OPENING[1];
      if (Math.sqrt(dx * dx + dy * dy) < CUP_OPENING_RADIUS) {
        finalHit = true;
      }
    }
  }

  return { hit: finalHit, points, duration: TOTAL_TIME };
}

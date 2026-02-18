import type { WorldManifest } from "../types.js";
import glassCircuit from "../../worlds/glass-circuit/manifest.json";
import ashenOath from "../../worlds/ashen-oath/manifest.json";
import starfallFrontier from "../../worlds/starfall-frontier/manifest.json";

export const BUILTIN_WORLDS: WorldManifest[] = [
  glassCircuit as WorldManifest,
  ashenOath as WorldManifest,
  starfallFrontier as WorldManifest,
];

export function getBuiltinWorldBySlug(slug: string): WorldManifest | undefined {
  return BUILTIN_WORLDS.find((world) => world.slug === slug);
}

import type { CSSProperties } from "react";

type DisplayWorld = {
  worldId?: string;
  _id?: string;
  genre?: string;
  title: string;
  description?: string;
  tags?: string[];
  slug?: string;
  ratingAverage?: number;
  ratingCount?: number;
  popularityScore?: number;
};

type WorldCardProps = {
  world: DisplayWorld;
  onSelect: (worldIdOrSlug: string) => void;
};

const cardStyle: CSSProperties = {
  textAlign: "left",
  border: "1px solid #d0c9b8",
  background: "#f7f2e8",
  padding: 12,
  borderRadius: 8,
  cursor: "pointer",
};

export function WorldCard({ world, onSelect }: WorldCardProps) {
  const target = world.worldId ?? world._id ?? world.slug ?? world.title;
  return (
    <button type="button" onClick={() => onSelect(target)} style={cardStyle}>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#7e6d4f" }}>
        {world.genre ?? "mixed"}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{world.title}</div>
      <div style={{ marginTop: 8, color: "#423d34" }}>{world.description ?? "No description provided."}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#61584d" }}>
        {(world.tags ?? []).join(" | ")}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#61584d" }}>
        Rating: {(world.ratingAverage ?? 0).toFixed(2)} ({world.ratingCount ?? 0}) | Popularity: {world.popularityScore ?? 0}
      </div>
    </button>
  );
}

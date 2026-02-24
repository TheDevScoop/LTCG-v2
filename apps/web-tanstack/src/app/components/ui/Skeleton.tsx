import React from "react";

interface SkeletonCardProps {
  className?: string;
  style?: React.CSSProperties;
}

export function SkeletonCard({ className = "", style }: SkeletonCardProps) {
  return (
    <div
      className={`paper-panel relative overflow-hidden ${className}`}
      style={{
        aspectRatio: "3 / 4",
        border: "2px solid #121212",
        boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)",
        ...style,
      }}
    >
      <div className="skeleton-shimmer" />
    </div>
  );
}

interface SkeletonRowProps {
  className?: string;
  height?: number;
}

export function SkeletonRow({ className = "", height = 48 }: SkeletonRowProps) {
  return (
    <div
      className={`paper-panel relative overflow-hidden w-full ${className}`}
      style={{
        height,
        border: "2px solid #121212",
        boxShadow: "4px 4px 0px 0px rgba(18,18,18,1)",
      }}
    >
      <div className="skeleton-shimmer" />
    </div>
  );
}

interface SkeletonGridProps {
  count?: number;
  columns?: string;
}

export function SkeletonGrid({
  count = 8,
  columns = "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
}: SkeletonGridProps) {
  return (
    <div className={`grid ${columns} gap-4`}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard
          key={i}
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}

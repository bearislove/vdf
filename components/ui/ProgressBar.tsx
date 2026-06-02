"use client";

interface ProgressBarProps {
  value: number;       // 0–100
  height?: number;
  color?: string;
  bg?: string;
  borderRadius?: number;
  animated?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  height = 3,
  color = "var(--accent)",
  bg = "var(--bg3)",
  borderRadius = 2,
  animated = true,
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={className}
      style={{
        height,
        background: bg,
        borderRadius,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius,
          transition: animated ? "width 300ms ease" : "none",
        }}
      />
    </div>
  );
}

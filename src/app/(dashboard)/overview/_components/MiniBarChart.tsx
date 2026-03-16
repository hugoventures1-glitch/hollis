"use client";

export function MiniBarChart({ bars }: { bars: number[] }) {
  return (
    <svg viewBox="0 0 140 38" width="100%" height="38" preserveAspectRatio="none">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 10 + 1}
          y={(1 - h) * 38}
          width={7}
          height={h * 38}
          rx={1.5}
          fill={
            i === bars.length - 1
              ? "rgba(250,250,250,0.80)"
              : i >= bars.length - 3
              ? "rgba(250,250,250,0.38)"
              : "rgba(250,250,250,0.16)"
          }
        />
      ))}
    </svg>
  );
}

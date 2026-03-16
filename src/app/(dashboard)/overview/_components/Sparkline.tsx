"use client";

export function Sparkline({ pts }: { pts: number[] }) {
  const max = Math.max(...pts, 1);
  const W = 100, H = 34;
  const points = pts
    .map((p, i) => `${(i / (pts.length - 1)) * W},${H - (p / max) * H}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="rgba(250,250,250,0.40)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

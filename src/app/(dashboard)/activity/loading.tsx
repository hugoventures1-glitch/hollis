export default function ActivityLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* Header — 56px, empty (matches real layout) */}
      <div className="h-[56px] shrink-0" />

      {/* Tab bar strip */}
      <div
        className="shrink-0 flex items-center px-8"
        style={{ height: 48, paddingTop: 6, paddingBottom: 6, marginTop: -21 }}
      >
        <div
          className="flex items-center rounded-lg animate-pulse"
          style={{ background: "var(--surface-raised)", padding: 3, gap: 2, width: 248, height: 34 }}
        >
          <div className="rounded" style={{ width: 120, height: 28, background: "var(--background)", border: "1px solid var(--border)" }} />
          <div className="rounded" style={{ width: 120, height: 28 }} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto" style={{ marginTop: 21 }}>
        <div className="max-w-6xl mx-auto px-8 py-8">

          {/* Heading */}
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="h-8 w-52 rounded-lg bg-border animate-pulse" />
            <div className="h-6 w-6 rounded bg-surface-raised animate-pulse" />
          </div>

          {/* Bento Grid — 3 cols, 5 tiles (matches real grid) */}
          <div className="grid grid-cols-3 gap-3 mb-10 animate-pulse">
            {/* Lime stat */}
            <div
              className="flex flex-col gap-2 p-4 rounded-xl"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", minHeight: 88 }}
            >
              <div className="h-2 w-28 rounded" style={{ background: "rgba(184,244,0,0.15)" }} />
              <div className="h-9 w-10 rounded" style={{ background: "rgba(184,244,0,0.2)" }} />
              <div className="h-2 w-12 rounded bg-surface" />
            </div>
            {/* Stat 2 */}
            <div
              className="flex flex-col gap-2 p-4 rounded-xl"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", minHeight: 88 }}
            >
              <div className="h-2 w-20 rounded bg-border" />
              <div className="h-9 w-8 rounded bg-border" />
              <div className="h-2 w-16 rounded bg-surface" />
            </div>
            {/* Stat 3 */}
            <div
              className="flex flex-col gap-2 p-4 rounded-xl"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", minHeight: 88 }}
            >
              <div className="h-2 w-16 rounded bg-border" />
              <div className="h-9 w-8 rounded bg-border" />
              <div className="h-2 w-14 rounded bg-surface" />
            </div>
            {/* Stat 4 */}
            <div
              className="flex flex-col gap-2 p-4 rounded-xl"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", minHeight: 88 }}
            >
              <div className="h-2 w-16 rounded bg-border" />
              <div className="h-9 w-8 rounded bg-border" />
              <div className="h-2 w-12 rounded bg-surface" />
            </div>
            {/* Stat 5 */}
            <div
              className="flex flex-col gap-2 p-4 rounded-xl"
              style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", minHeight: 88 }}
            >
              <div className="h-2 w-20 rounded bg-border" />
              <div className="h-9 w-8 rounded bg-border" />
              <div className="h-2 w-16 rounded bg-surface" />
            </div>
          </div>

          {/* 2-col layout — 148px monitoring + 1fr feed */}
          <div className="grid gap-8 animate-pulse" style={{ gridTemplateColumns: "148px 1fr" }}>

            {/* Left: monitoring list */}
            <div className="flex flex-col gap-2.5">
              <div className="h-2 w-16 rounded bg-border mb-2" />
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full shrink-0" style={{ background: "rgba(184,244,0,0.12)" }} />
                  <div className="h-2 rounded bg-surface-raised" style={{ width: `${55 + (i % 3) * 15}%` }} />
                </div>
              ))}
            </div>

            {/* Right: activity cards */}
            <div className="flex flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center w-4 shrink-0">
                    <div className="w-px flex-1" style={{ background: i === 0 ? "transparent" : "var(--border)", minHeight: 14 }} />
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--border)" }} />
                    <div className="w-px flex-1" style={{ background: "var(--border)", minHeight: 14 }} />
                  </div>
                  {/* Card */}
                  <div
                    className="flex-1 mb-2 flex items-start gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: "var(--surface-raised)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="w-6 h-6 rounded shrink-0 mt-0.5" style={{ background: "var(--surface)" }} />
                    <div className="flex-1 flex flex-col gap-1.5 pt-0.5">
                      <div className="h-3 rounded bg-border" style={{ width: `${40 + (i % 3) * 12}%` }} />
                      <div className="h-2.5 rounded bg-surface" style={{ width: "30%" }} />
                    </div>
                    <div className="h-2 w-8 rounded bg-surface shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

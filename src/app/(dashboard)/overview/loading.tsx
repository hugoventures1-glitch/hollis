export default function OverviewLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Header skeleton */}
      <div className="px-8 pt-8 pb-6 shrink-0">
        <div className="h-9 w-56 rounded-lg bg-surface-raised animate-pulse mb-2" />
        <div className="h-4 w-72 rounded bg-surface-raised animate-pulse" />
      </div>

      {/* Cards grid skeleton */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 flex flex-col gap-3 animate-pulse"
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                minHeight: 196,
              }}
            >
              {/* Card header */}
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-border" />
                <div className="h-3 w-20 rounded bg-border" />
              </div>
              {/* Card value */}
              <div className="mt-auto">
                <div className="h-8 w-28 rounded-lg bg-border mb-2" />
                <div className="h-3 w-16 rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DocumentsLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* Header — 56px with + New button */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid var(--border)" }}
      >
        <div className="h-2.5 w-28 rounded bg-border animate-pulse" />
        <div className="h-8 w-28 rounded-md animate-pulse" style={{ background: "var(--border)" }} />
      </div>

      {/* Filter tabs — below header */}
      <div
        className="flex items-center gap-5 px-6 shrink-0"
        style={{ height: 48, borderBottom: "1px solid var(--border)" }}
      >
        {[["All", true], ["Active", false], ["Received", false]].map(([label, active], i) => (
          <div key={i} className="flex items-center gap-1.5 animate-pulse">
            <div
              className="h-3 rounded bg-border"
              style={{ width: i === 0 ? 24 : i === 1 ? 44 : 60, opacity: (active as boolean) ? 1 : 0.5 }}
            />
            <div className="h-3 w-5 rounded bg-surface" />
          </div>
        ))}
      </div>

      {/* Row list — ChaseRow style: icon + client name + doc type + status + actions */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-6 animate-pulse shrink-0"
            style={{ height: 60, borderBottom: "1px solid var(--surface)" }}
          >
            {/* Icon box */}
            <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: "var(--surface-raised)" }} />
            {/* Text */}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-3 rounded bg-border" style={{ width: 140 }} />
              <div className="h-2.5 rounded bg-surface" style={{ width: 100 }} />
            </div>
            {/* Status badge */}
            <div className="h-5 w-14 rounded-full bg-surface-raised" />
            {/* Action buttons */}
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-md bg-surface-raised" />
              <div className="h-7 w-7 rounded-md bg-surface-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

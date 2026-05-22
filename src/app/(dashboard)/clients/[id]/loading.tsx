export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--background)" }}>

      {/* Breadcrumb header — 56px */}
      <div
        className="flex items-center justify-between px-8 shrink-0"
        style={{ height: 56, borderBottom: "1px solid var(--surface-raised)" }}
      >
        <div className="flex items-center gap-2 animate-hollis-shimmer">
          <div className="h-2.5 w-12 rounded bg-surface-raised" />
          <div className="h-2.5 w-2 rounded bg-surface-raised" />
          <div className="h-2.5 w-40 rounded bg-surface-raised" />
        </div>
        <div className="h-8 w-28 rounded-md bg-surface-raised animate-hollis-shimmer" style={{ border: "1px solid var(--border)" }} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col gap-5">

        {/* Client info card — 3-col grid */}
        <div
          className="rounded-2xl p-6 animate-hollis-shimmer"
          style={{ background: "var(--surface)", border: "1px solid var(--surface-raised)" }}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="h-5 w-44 rounded bg-surface-raised mb-2" />
              <div className="h-3 w-28 rounded bg-surface-raised" />
            </div>
            <div className="h-5 w-16 rounded-full bg-surface-raised" />
          </div>
          <div className="grid grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-2 w-20 rounded bg-surface-raised" />
                <div className="h-3.5 rounded bg-surface-raised" style={{ width: [130, 160, 80, 100, 120, 90][i] }} />
              </div>
            ))}
          </div>
        </div>

        {/* Active policy card(s) */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl px-5 py-4 flex items-center gap-4 animate-hollis-shimmer"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-raised)" }}
            >
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3.5 rounded bg-surface-raised" style={{ width: 180 }} />
                <div className="h-2.5 rounded bg-surface-raised" style={{ width: 120 }} />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 rounded-full bg-surface-raised" />
                <div className="h-5 w-16 rounded-full bg-surface-raised" />
              </div>
              <div className="h-7 w-7 rounded-md bg-surface-raised" />
            </div>
          ))}
        </div>

        {/* Timeline/audit section */}
        <div className="flex flex-col gap-1.5 mt-2">
          <div className="h-2.5 w-20 rounded bg-surface-raised animate-hollis-shimmer mb-2" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 animate-hollis-shimmer"
              style={{ height: 40 }}
            >
              <div className="w-2 h-2 rounded-full shrink-0 bg-surface-raised" />
              <div className="flex-1 h-2.5 rounded bg-surface-raised" style={{ width: "50%" }} />
              <div className="h-2 w-14 rounded bg-surface-raised" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

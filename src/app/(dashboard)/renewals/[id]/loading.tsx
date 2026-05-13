export default function RenewalDetailLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* Header — matches px-10 h-[56px] */}
      <div
        className="flex items-center gap-3 px-10 h-[56px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-2.5 w-16 rounded bg-border" />
          <div className="h-2.5 w-2 rounded bg-surface-raised" />
          <div className="h-2.5 w-40 rounded bg-border" />
        </div>
        {/* StageBadge on the right */}
        <div className="ml-auto h-5 w-20 rounded-full bg-surface-raised animate-pulse" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-10 py-10 space-y-8">

          {/* Policy summary card */}
          <div
            className="rounded-xl p-6 animate-pulse"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="h-5 w-52 rounded bg-border mb-2" />
                <div className="h-3 w-28 rounded bg-surface-raised" />
              </div>
              <div className="h-6 w-20 rounded-full bg-border" />
            </div>

            {/* 2×4 info grid */}
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-2 w-16 rounded bg-surface-raised" />
                  <div className="h-3.5 rounded bg-border" style={{ width: [80, 120, 70, 64, 100, 56, 90, 80][i] }} />
                </div>
              ))}
            </div>
          </div>

          {/* RenewalOverrideControls skeleton */}
          <div
            className="rounded-xl p-5 animate-pulse"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="h-3 w-32 rounded bg-border mb-4" />
            <div className="flex gap-3">
              <div className="h-8 w-28 rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
              <div className="h-8 w-28 rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
            </div>
          </div>

          {/* PolicyTimelinePanel skeleton */}
          <div
            className="rounded-xl p-5 animate-pulse"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="h-3 w-40 rounded bg-border mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-2.5 w-24 rounded bg-surface-raised" />
                  <div className="h-2 flex-1 rounded bg-surface-raised" />
                  <div className="h-2.5 w-14 rounded bg-surface-raised" />
                </div>
              ))}
            </div>
          </div>

          {/* Campaign Timeline section */}
          <div>
            <div className="h-2.5 w-36 rounded bg-border mb-4 animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl p-5 animate-pulse"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-surface-raised" />
                      <div>
                        <div className="h-3.5 w-36 rounded bg-border mb-1.5" />
                        <div className="h-2.5 w-52 rounded bg-surface-raised" />
                      </div>
                    </div>
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

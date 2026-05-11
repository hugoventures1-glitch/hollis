export default function RenewalDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--background)" }}>

      {/* Breadcrumb header — 56px */}
      <div
        className="flex items-center justify-between px-8 shrink-0"
        style={{ height: 56, borderBottom: "1px solid var(--surface-raised)" }}
      >
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-2.5 w-14 rounded bg-border" />
          <div className="h-2.5 w-2 rounded bg-surface-raised" />
          <div className="h-2.5 w-36 rounded bg-border" />
        </div>
        <div className="flex gap-2 animate-pulse">
          <div className="h-8 w-28 rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
          <div className="h-8 w-24 rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col gap-5">

          {/* Policy identity card */}
          <div
            className="rounded-2xl p-6 animate-pulse"
            style={{ background: "var(--surface)", border: "1px solid var(--surface)" }}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="h-5 w-48 rounded bg-border mb-2" />
                <div className="h-3 w-32 rounded bg-surface-raised" />
              </div>
              <div className="h-6 w-20 rounded-full bg-border" />
            </div>
            <div className="grid grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-2 w-20 rounded bg-surface-raised" />
                  <div className="h-3.5 rounded bg-border" style={{ width: [120, 80, 100, 140, 90, 110][i] }} />
                </div>
              ))}
            </div>
          </div>

          {/* Campaign timeline */}
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center px-4 rounded-xl animate-pulse"
                style={{ height: 44, background: i === 0 ? "var(--surface-raised)" : "#0D0D0D", border: "1px solid var(--surface)" }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: i === 0 ? "var(--border)" : "var(--surface)" }} />
                <div className="ml-3 h-3 rounded bg-border" style={{ width: [140, 120, 110, 130, 100, 120][i] }} />
                <div className="ml-auto h-2.5 w-16 rounded bg-surface-raised" />
                <div className="ml-4 h-5 w-14 rounded-full bg-surface" />
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar — narrow panel */}
        <div
          className="shrink-0 flex flex-col gap-6 px-5 py-6 overflow-hidden"
          style={{ width: 260, borderLeft: "1px solid var(--surface-raised)" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 animate-pulse">
              <div className="h-2 w-16 rounded bg-surface-raised" />
              <div className="h-3.5 rounded bg-border" style={{ width: [80, 100, 64, 90][i] }} />
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-2 animate-pulse">
            <div className="h-8 w-full rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
            <div className="h-8 w-full rounded-md bg-surface-raised" style={{ border: "1px solid var(--border)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

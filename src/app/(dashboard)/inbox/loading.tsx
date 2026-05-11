export default function InboxLoading() {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--background)" }}>

      {/* Left column — fixed width matching real InboxClient */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 340, borderRight: "1px solid var(--border)" }}
      >
        {/* "from hollis" header — 40px */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 40, borderBottom: "1px solid var(--border)" }}
        >
          <div className="h-2 w-20 rounded bg-border animate-pulse" />
        </div>

        {/* Tab strip — 3 equal tabs */}
        <div
          className="flex shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-center py-2.5 animate-pulse"
            >
              <div className="h-2.5 rounded bg-border" style={{ width: i === 1 ? 44 : i === 2 ? 36 : 64 }} />
            </div>
          ))}
        </div>

        {/* Row list */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-3.5 animate-pulse shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {/* Policy ref + name line */}
              <div className="h-3 rounded bg-border mb-2" style={{ width: "70%" }} />
              {/* Carrier badge + client + time */}
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                <div className="h-3 w-10 rounded bg-surface shrink-0" />
                <div className="flex-1 h-2.5 rounded bg-surface-raised" />
                <div className="h-2 w-6 rounded bg-surface-raised shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right detail pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Detail header */}
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-14 rounded-full bg-border animate-pulse" />
                <div className="h-4 w-20 rounded-full bg-border animate-pulse" />
              </div>
              <div className="h-4 w-64 rounded bg-border animate-pulse" />
            </div>
            <div className="h-8 w-24 rounded-md bg-border animate-pulse" />
          </div>
        </div>

        {/* Action buttons row */}
        <div
          className="flex items-center gap-3 px-6 py-3 shrink-0 animate-pulse"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="h-8 w-28 rounded-md bg-border" />
          <div className="h-8 w-20 rounded-md bg-surface-raised" />
          <div className="h-8 w-20 rounded-md bg-surface-raised" />
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-4 overflow-hidden animate-pulse">
          <div className="h-3 w-32 rounded bg-surface-raised" />
          <div className="rounded-xl p-4" style={{ background: "var(--surface-raised)", border: "1px solid var(--surface)" }}>
            <div className="flex flex-col gap-2.5">
              <div className="h-3 w-full rounded bg-border" />
              <div className="h-3 rounded bg-border" style={{ width: "85%" }} />
              <div className="h-3 rounded bg-border" style={{ width: "70%" }} />
            </div>
          </div>
          <div className="flex gap-6 mt-2">
            {[["Carrier", 80], ["Expiry", 64], ["Stage", 90]].map(([label, w], i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-2 w-12 rounded bg-surface-raised" />
                <div className="h-3.5 rounded bg-border" style={{ width: w }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

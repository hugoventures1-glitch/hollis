export default function InboxLoading() {
  // Row widths mirror the real ListRow grid:
  // col-1: client name (bold) + headline text
  // col-2: type pill
  // col-3: expiry + time
  const rows = [
    { nameW: 120, headlineW: 220, pillW: 64,  expiry: true,  timeW: 24 },
    { nameW: 96,  headlineW: 180, pillW: 56,  expiry: false, timeW: 20 },
    { nameW: 140, headlineW: 200, pillW: 72,  expiry: true,  timeW: 28 },
    { nameW: 108, headlineW: 160, pillW: 64,  expiry: false, timeW: 24 },
    { nameW: 88,  headlineW: 240, pillW: 56,  expiry: true,  timeW: 20 },
    { nameW: 132, headlineW: 190, pillW: 72,  expiry: false, timeW: 28 },
    { nameW: 100, headlineW: 210, pillW: 64,  expiry: true,  timeW: 24 },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--background)" }}>

      {/* Header — mirrors ListView header */}
      <header style={{ padding: "28px 32px 0", flexShrink: 0 }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 22 }}>
          <div className="h-6 w-14 rounded bg-border animate-hollis-shimmer" />
          <div className="h-3.5 w-48 rounded bg-surface-raised animate-hollis-shimmer" />
        </div>

        {/* Tab strip — 4 tabs matching All / Decisions / To-Dos / Doc Chase */}
        <div style={{ display: "flex", gap: 24, alignItems: "center", borderBottom: "1px solid var(--border-subtle)" }}>
          {[44, 64, 52, 68].map((w, i) => (
            <div
              key={i}
              className="animate-hollis-shimmer"
              style={{ padding: "10px 0", marginBottom: -1 }}
            >
              <div className="h-2.5 rounded bg-border" style={{ width: w }} />
            </div>
          ))}
        </div>
      </header>

      {/* Day label */}
      <div style={{ padding: "20px 32px 6px 28px" }}>
        <div className="h-2 w-10 rounded bg-surface-raised animate-hollis-shimmer" />
      </div>

      {/* List rows */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className="animate-hollis-shimmer"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto auto",
              columnGap: 18,
              alignItems: "center",
              padding: "14px 32px 14px 28px",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {/* Col 1: client name + headline */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
              <div
                className="h-3 rounded bg-border shrink-0"
                style={{ width: r.nameW }}
              />
              <div
                className="h-3 rounded bg-surface-raised"
                style={{ width: r.headlineW }}
              />
            </div>

            {/* Col 2: type pill */}
            <div
              className="h-5 rounded-full bg-surface-raised"
              style={{ width: r.pillW }}
            />

            {/* Col 3: expiry + time */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {r.expiry && (
                <div className="h-2.5 w-[78px] rounded bg-surface-raised" />
              )}
              <div
                className="h-2.5 rounded bg-surface-raised"
                style={{ width: r.timeW }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

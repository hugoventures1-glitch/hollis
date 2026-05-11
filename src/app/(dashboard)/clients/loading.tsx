export default function ClientsLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>

      {/* Header — 56px */}
      <header
        className="h-[56px] shrink-0 flex items-center px-6"
        style={{ borderBottom: "1px solid var(--surface)" }}
      >
        <div className="h-2.5 w-8 rounded bg-border animate-pulse" />
      </header>

      {/* Search + Tabs bar — 60px */}
      <div
        className="shrink-0 px-6 flex items-center gap-6"
        style={{ height: 60, borderBottom: "1px solid var(--surface)" }}
      >
        {/* Search box */}
        <div
          className="rounded-xl shrink-0 animate-pulse"
          style={{ width: 280, height: 44, background: "#0E0E0E", border: "1px solid var(--border)" }}
        />
        {/* Tabs pill */}
        <div
          className="flex items-center gap-2 px-2 rounded-lg shrink-0"
          style={{ background: "var(--surface)", height: 40 }}
        >
          {[40, 84, 96].map((w, i) => (
            <div
              key={i}
              className="rounded-md animate-pulse"
              style={{
                width: w,
                height: 28,
                background: i === 0 ? "#0E0E0E" : "transparent",
                border: i === 0 ? "1px solid var(--border)" : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center px-6 animate-pulse"
            style={{ height: 52, borderBottom: "1px solid var(--surface)" }}
          >
            <div className="h-3 rounded bg-surface-raised" style={{ width: 160 }} />
            <div className="ml-10 h-3 rounded bg-surface-raised" style={{ width: 180 }} />
            <div className="ml-auto h-3 rounded bg-surface-raised" style={{ width: 80 }} />
            <div className="ml-8 h-5 w-16 rounded-full bg-surface-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}

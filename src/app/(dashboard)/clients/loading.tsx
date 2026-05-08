export default function ClientsLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="h-3 w-8 rounded bg-[#1C1C1C] animate-pulse" />
      </div>

      {/* Search + tabs */}
      <div
        className="flex items-center gap-6 px-6 shrink-0"
        style={{ height: 60, borderBottom: "1px solid #1A1A1A" }}
      >
        <div className="h-7 w-56 rounded-lg bg-[#141414] animate-pulse" />
        {[40, 64, 72].map((w, i) => (
          <div key={i} className="h-3 rounded bg-[#1C1C1C] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Table header */}
      <div
        className="flex items-center px-6 gap-6 shrink-0"
        style={{ height: 36, borderBottom: "1px solid #181818" }}
      >
        {[140, 120, 80, 80].map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-[#181818] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 px-6 animate-pulse shrink-0"
            style={{ height: 52, borderBottom: "1px solid #111" }}
          >
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 160 }} />
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 140 }} />
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 80 }} />
            <div className="h-5 w-20 rounded-full bg-[#151515]" />
          </div>
        ))}
      </div>
    </div>
  );
}

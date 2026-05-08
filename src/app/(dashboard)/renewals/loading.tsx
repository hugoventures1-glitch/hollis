export default function RenewalsLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center px-14 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="h-4 w-24 rounded bg-[#1C1C1C] animate-pulse" />
      </div>

      {/* Tabs + search bar */}
      <div
        className="flex items-center gap-6 px-14 shrink-0"
        style={{ height: 52, borderBottom: "1px solid #181818" }}
      >
        {[80, 72, 68].map((w, i) => (
          <div key={i} className="h-3 rounded bg-[#1C1C1C] animate-pulse" style={{ width: w }} />
        ))}
        <div className="ml-auto h-7 w-48 rounded-lg bg-[#141414] animate-pulse" />
      </div>

      {/* Table header */}
      <div
        className="flex items-center px-14 gap-4 shrink-0"
        style={{ height: 40, borderBottom: "1px solid #181818" }}
      >
        {[160, 120, 100, 80, 80].map((w, i) => (
          <div key={i} className="h-2.5 rounded bg-[#181818] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-hidden px-14 py-2 flex flex-col gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-0 animate-pulse"
            style={{ height: 52 }}
          >
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 160 }} />
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 120 }} />
            <div className="h-3.5 rounded bg-[#151515]" style={{ width: 100 }} />
            <div className="h-5 w-20 rounded-full bg-[#151515]" />
            <div className="h-5 w-16 rounded-full bg-[#151515]" />
          </div>
        ))}
      </div>
    </div>
  );
}

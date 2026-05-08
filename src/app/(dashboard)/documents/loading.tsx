export default function DocumentsLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="h-3 w-28 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="h-7 w-28 rounded-lg bg-[#141414] animate-pulse" />
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-5 px-6 shrink-0"
        style={{ height: 48, borderBottom: "1px solid #181818" }}
      >
        {[52, 60, 48].map((w, i) => (
          <div key={i} className="h-3 rounded bg-[#1C1C1C] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-hidden px-6 py-3 flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse"
            style={{ background: "#141414", border: "1px solid #1A1A1A" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E1E1E] shrink-0" />
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="h-3 rounded bg-[#252525]" style={{ width: "50%" }} />
                <div className="h-2.5 rounded bg-[#1E1E1E]" style={{ width: "35%" }} />
              </div>
              <div className="h-5 w-16 rounded-full bg-[#1E1E1E]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActivityLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="h-3 w-20 rounded bg-[#1C1C1C] animate-pulse" />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-hidden px-6 py-4 flex flex-col gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-[#252525] mt-2 shrink-0" />
            <div className="flex-1 rounded-xl p-4" style={{ background: "#141414", border: "1px solid #1A1A1A" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-40 rounded bg-[#252525]" />
                <div className="h-2.5 w-20 rounded bg-[#1E1E1E]" />
              </div>
              <div className="h-2.5 w-64 rounded bg-[#1E1E1E]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

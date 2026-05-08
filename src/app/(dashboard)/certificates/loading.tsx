export default function CertificatesLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="h-3 w-24 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="h-7 w-28 rounded-lg bg-[#141414] animate-pulse" />
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-5 px-6 shrink-0"
        style={{ height: 48, borderBottom: "1px solid #181818" }}
      >
        {[52, 60].map((w, i) => (
          <div key={i} className="h-3 rounded bg-[#1C1C1C] animate-pulse" style={{ width: w }} />
        ))}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-hidden px-6 py-4 grid grid-cols-3 gap-3 content-start">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse"
            style={{ background: "#141414", border: "1px solid #1A1A1A", height: 120 }}
          >
            <div className="h-3 w-32 rounded bg-[#252525] mb-2" />
            <div className="h-2.5 w-24 rounded bg-[#1E1E1E] mb-3" />
            <div className="flex gap-2">
              <div className="h-5 w-14 rounded-full bg-[#1E1E1E]" />
              <div className="h-5 w-14 rounded-full bg-[#1E1E1E]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

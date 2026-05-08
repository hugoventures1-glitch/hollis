export default function ActivityLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0C0C0C" }}>

      {/* Header — 56px with Live/History toggle on the right */}
      <header
        className="h-[56px] shrink-0 flex items-center justify-between px-6"
        style={{ borderBottom: "1px solid #1C1C1C" }}
      >
        <div className="h-2.5 w-14 rounded bg-[#1C1C1C] animate-pulse" />
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-md animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1C1C1C" }}
        >
          <div className="w-10 h-6 rounded bg-[rgba(255,255,255,0.07)]" />
          <div className="w-14 h-6 rounded" />
        </div>
      </header>

      {/* Bento stats row — 4 tiles */}
      <div className="px-6 pt-5 pb-4 grid grid-cols-4 gap-3 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 flex flex-col gap-2 animate-pulse"
            style={{ background: "#111111", border: "1px solid #1A1A1A", minHeight: 80 }}
          >
            <div className="h-2 w-16 rounded bg-[#1A1A1A]" />
            <div className="h-7 w-12 rounded bg-[#1C1C1C]" />
          </div>
        ))}
      </div>

      {/* Session blocks */}
      <div className="flex-1 overflow-hidden px-6 pb-6 flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, si) => (
          <div
            key={si}
            className="rounded-xl overflow-hidden animate-pulse"
            style={{ background: "#0D0D0D", border: "1px solid #1A1A1A" }}
          >
            {/* Session header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid #1A1A1A" }}
            >
              <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: si === 0 ? 200 : 180 }} />
              <div className="ml-auto h-2.5 w-12 rounded bg-[#1A1A1A]" />
            </div>

            {/* Activity cards */}
            {Array.from({ length: si === 0 ? 3 : 2 }).map((_, ci) => (
              <div key={ci} className="flex gap-3 px-4 py-2.5">
                {/* Timeline dot + line */}
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div className="w-px flex-1" style={{ background: ci === 0 ? "transparent" : "#1E1E1E" }} />
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }} />
                  <div className="w-px flex-1" style={{ background: "#1E1E1E" }} />
                </div>
                {/* Card */}
                <div
                  className="flex-1 mb-2 flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1A1A1A" }}
                >
                  <div className="w-6 h-6 rounded shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: "55%" }} />
                    <div className="h-2.5 rounded bg-[#181818]" style={{ width: "35%" }} />
                  </div>
                  <div className="h-2 w-8 rounded bg-[#181818] shrink-0" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

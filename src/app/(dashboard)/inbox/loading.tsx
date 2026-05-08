export default function InboxLoading() {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Left panel skeleton */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 340, borderRight: "1px solid #181818" }}
      >
        {/* Header */}
        <div
          className="flex items-center px-4 shrink-0"
          style={{ height: 56, borderBottom: "1px solid #181818" }}
        >
          <div className="h-4 w-16 rounded bg-[#1C1C1C] animate-pulse" />
          <div className="ml-auto h-3 w-10 rounded bg-[#1C1C1C] animate-pulse" />
        </div>
        {/* Tabs */}
        <div
          className="flex items-center gap-4 px-4 shrink-0"
          style={{ height: 44, borderBottom: "1px solid #181818" }}
        >
          {[60, 48, 72].map((w, i) => (
            <div key={i} className="h-3 rounded bg-[#1C1C1C] animate-pulse" style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        <div className="flex-1 overflow-hidden py-2 px-3 flex flex-col gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-3 animate-pulse"
              style={{ background: "#141414", minHeight: 72 }}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#252525] mt-1.5 shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3 rounded bg-[#252525]" style={{ width: "60%" }} />
                  <div className="h-3 rounded bg-[#1E1E1E]" style={{ width: "80%" }} />
                  <div className="h-2.5 rounded bg-[#1A1A1A]" style={{ width: "40%" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail pane skeleton */}
      <div className="flex-1 flex flex-col">
        <div
          className="shrink-0 flex items-center px-6"
          style={{ height: 56, borderBottom: "1px solid #181818" }}
        >
          <div className="h-4 w-40 rounded bg-[#1C1C1C] animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-3 w-32 rounded bg-[#1C1C1C] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

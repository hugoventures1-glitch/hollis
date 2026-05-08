export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-3 w-12 rounded bg-[#1C1C1C] animate-pulse" />
          <div className="h-3 w-3 rounded bg-[#1A1A1A] animate-pulse" />
          <div className="h-3 w-36 rounded bg-[#1C1C1C] animate-pulse" />
        </div>
        <div className="h-7 w-28 rounded-lg bg-[#141414] animate-pulse" />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col gap-4">
        {/* Info grid */}
        <div
          className="rounded-2xl p-6 animate-pulse"
          style={{ background: "#141414", border: "1px solid #1A1A1A" }}
        >
          <div className="grid grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-2.5 w-20 rounded bg-[#1E1E1E]" />
                <div className="h-4 w-28 rounded bg-[#252525]" />
              </div>
            ))}
          </div>
        </div>

        {/* Policy cards */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-4 animate-pulse"
              style={{ background: "#141414", border: "1px solid #1A1A1A" }}
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-44 rounded bg-[#252525]" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-[#1E1E1E]" />
                  <div className="h-5 w-16 rounded-full bg-[#1E1E1E]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

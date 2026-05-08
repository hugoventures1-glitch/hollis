export default function SettingsLoading() {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#0C0C0C" }}>
      {/* Sidebar */}
      <div
        className="flex flex-col shrink-0 py-6 px-3 gap-1"
        style={{ width: 200, borderRight: "1px solid #181818" }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-[#141414] animate-pulse" />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-10 py-8 flex flex-col gap-6">
        <div className="h-6 w-40 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{ background: "#141414", border: "1px solid #1A1A1A", height: 80 }}
            >
              <div className="h-3 w-32 rounded bg-[#252525] mb-2" />
              <div className="h-2.5 w-56 rounded bg-[#1E1E1E]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

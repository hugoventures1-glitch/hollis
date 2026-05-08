export default function SettingsLoading() {
  return (
    <div className="flex h-full overflow-hidden bg-[#0C0C0C]">

      {/* Left nav rail — w-[200px], matches SettingsShell exactly */}
      <nav
        className="w-[200px] shrink-0 pt-8 pb-4 flex flex-col gap-0.5 px-2"
        style={{ borderRight: "1px solid #181818" }}
      >
        {/* "Settings" label */}
        <div className="h-2 w-14 rounded bg-[#1A1A1A] animate-pulse mb-4 ml-2" />
        {/* 9 tab items */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-2.5 rounded-[4px] animate-pulse"
            style={{ height: 36, background: i === 0 ? "#1C1C1C" : "transparent" }}
          >
            <div
              className="w-4 h-4 rounded shrink-0"
              style={{ background: i === 0 ? "#2A2A2A" : "#1A1A1A" }}
            />
            <div
              className="h-2.5 rounded"
              style={{
                width: [48, 44, 52, 112, 80, 92, 60, 60, 80][i],
                background: i === 0 ? "#2A2A2A" : "#1A1A1A",
              }}
            />
          </div>
        ))}
      </nav>

      {/* Right content area */}
      <div className="flex-1 overflow-hidden px-10 py-8 flex flex-col gap-6">
        <div className="h-5 w-12 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 flex flex-col gap-2 animate-pulse"
              style={{ background: "#111111", border: "1px solid #1A1A1A" }}
            >
              <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: 120 }} />
              <div className="h-2.5 rounded bg-[#181818]" style={{ width: 240 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

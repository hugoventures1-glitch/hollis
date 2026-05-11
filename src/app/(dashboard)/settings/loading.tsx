export default function SettingsLoading() {
  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* Left nav rail — w-[200px], matches SettingsShell exactly */}
      <nav
        className="w-[200px] shrink-0 pt-8 pb-4 flex flex-col gap-0.5 px-2"
        style={{ borderRight: "1px solid var(--border-subtle)" }}
      >
        {/* "Settings" label */}
        <div className="h-2 w-14 rounded bg-surface-raised animate-pulse mb-4 ml-2" />
        {/* 9 tab items */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-2.5 rounded-[4px] animate-pulse"
            style={{ height: 36, background: i === 0 ? "var(--border)" : "transparent" }}
          >
            <div
              className="w-4 h-4 rounded shrink-0"
              style={{ background: i === 0 ? "var(--border)" : "var(--surface-raised)" }}
            />
            <div
              className="h-2.5 rounded"
              style={{
                width: [48, 44, 52, 112, 80, 92, 60, 60, 80][i],
                background: i === 0 ? "var(--border)" : "var(--surface-raised)",
              }}
            />
          </div>
        ))}
      </nav>

      {/* Right content area */}
      <div className="flex-1 overflow-hidden px-10 py-8 flex flex-col gap-6">
        <div className="h-5 w-12 rounded bg-border animate-pulse" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 flex flex-col gap-2 animate-pulse"
              style={{ background: "var(--surface)", border: "1px solid var(--surface-raised)" }}
            >
              <div className="h-3 rounded bg-border" style={{ width: 120 }} />
              <div className="h-2.5 rounded bg-surface-raised" style={{ width: 240 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

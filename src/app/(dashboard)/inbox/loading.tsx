export default function InboxLoading() {
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#0C0C0C" }}>

      {/* Left column — fixed width matching real InboxClient */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 340, borderRight: "1px solid var(--border, #1C1C1C)" }}
      >
        {/* "from hollis" header — 40px */}
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{ height: 40, borderBottom: "1px solid #1C1C1C" }}
        >
          <div className="h-2 w-20 rounded bg-[#1C1C1C] animate-pulse" />
        </div>

        {/* Tab strip — 3 equal tabs */}
        <div
          className="flex shrink-0"
          style={{ borderBottom: "1px solid #1C1C1C" }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-center py-2.5 animate-pulse"
            >
              <div className="h-2.5 rounded bg-[#1C1C1C]" style={{ width: i === 1 ? 44 : i === 2 ? 36 : 64 }} />
            </div>
          ))}
        </div>

        {/* Row list */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-3.5 animate-pulse shrink-0"
              style={{ borderBottom: "1px solid #1C1C1C" }}
            >
              {/* Policy ref + name line */}
              <div className="h-3 rounded bg-[#1C1C1C] mb-2" style={{ width: "70%" }} />
              {/* Carrier badge + client + time */}
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#1C1C1C] shrink-0" />
                <div className="h-3 w-10 rounded bg-[#1A1A1A] shrink-0" />
                <div className="flex-1 h-2.5 rounded bg-[#181818]" />
                <div className="h-2 w-6 rounded bg-[#181818] shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right detail pane */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Detail header */}
        <div
          className="shrink-0 px-6 py-4"
          style={{ borderBottom: "1px solid #1C1C1C" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-14 rounded-full bg-[#1C1C1C] animate-pulse" />
                <div className="h-4 w-20 rounded-full bg-[#1C1C1C] animate-pulse" />
              </div>
              <div className="h-4 w-64 rounded bg-[#1C1C1C] animate-pulse" />
            </div>
            <div className="h-8 w-24 rounded-md bg-[#1C1C1C] animate-pulse" />
          </div>
        </div>

        {/* Action buttons row */}
        <div
          className="flex items-center gap-3 px-6 py-3 shrink-0 animate-pulse"
          style={{ borderBottom: "1px solid #1C1C1C" }}
        >
          <div className="h-8 w-28 rounded-md bg-[#1C1C1C]" />
          <div className="h-8 w-20 rounded-md bg-[#161616]" />
          <div className="h-8 w-20 rounded-md bg-[#161616]" />
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-4 overflow-hidden animate-pulse">
          <div className="h-3 w-32 rounded bg-[#181818]" />
          <div className="rounded-xl p-4" style={{ background: "#141414", border: "1px solid #1A1A1A" }}>
            <div className="flex flex-col gap-2.5">
              <div className="h-3 w-full rounded bg-[#1C1C1C]" />
              <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: "85%" }} />
              <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: "70%" }} />
            </div>
          </div>
          <div className="flex gap-6 mt-2">
            {[["Carrier", 80], ["Expiry", 64], ["Stage", 90]].map(([label, w], i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-2 w-12 rounded bg-[#181818]" />
                <div className="h-3.5 rounded bg-[#1C1C1C]" style={{ width: w }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

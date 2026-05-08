export default function DocumentsLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0C0C0C" }}>

      {/* Header — 56px with + New button */}
      <div
        className="flex items-center justify-between px-6 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #1C1C1C" }}
      >
        <div className="h-2.5 w-28 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="h-8 w-28 rounded-md animate-pulse" style={{ background: "#1C1C1C" }} />
      </div>

      {/* Filter tabs — below header */}
      <div
        className="flex items-center gap-5 px-6 shrink-0"
        style={{ height: 48, borderBottom: "1px solid #1C1C1C" }}
      >
        {[["All", true], ["Active", false], ["Received", false]].map(([label, active], i) => (
          <div key={i} className="flex items-center gap-1.5 animate-pulse">
            <div
              className="h-3 rounded bg-[#1C1C1C]"
              style={{ width: i === 0 ? 24 : i === 1 ? 44 : 60, opacity: (active as boolean) ? 1 : 0.5 }}
            />
            <div className="h-3 w-5 rounded bg-[#181818]" />
          </div>
        ))}
      </div>

      {/* Row list — ChaseRow style: icon + client name + doc type + status + actions */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-6 animate-pulse shrink-0"
            style={{ height: 60, borderBottom: "1px solid #111111" }}
          >
            {/* Icon box */}
            <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: "#161616" }} />
            {/* Text */}
            <div className="flex flex-col gap-1.5 flex-1">
              <div className="h-3 rounded bg-[#1C1C1C]" style={{ width: 140 }} />
              <div className="h-2.5 rounded bg-[#181818]" style={{ width: 100 }} />
            </div>
            {/* Status badge */}
            <div className="h-5 w-14 rounded-full bg-[#161616]" />
            {/* Action buttons */}
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-md bg-[#161616]" />
              <div className="h-7 w-7 rounded-md bg-[#161616]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

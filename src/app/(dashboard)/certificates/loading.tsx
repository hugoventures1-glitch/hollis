export default function CertificatesLoading() {
  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">

      {/* Header — 56px with buttons on right */}
      <div
        className="flex items-center justify-between px-10 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #1C1C1C" }}
      >
        <div className="h-2.5 w-24 rounded bg-[#1C1C1C] animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 rounded-md animate-pulse" style={{ background: "#111", border: "1px solid #1C1C1C" }} />
          <div className="h-8 w-24 rounded-md bg-[#E8E8E8]/10 animate-pulse" />
        </div>
      </div>

      {/* Stats strip — horizontal, divided by borders */}
      <div
        className="flex items-center gap-0 px-10 py-7 shrink-0 animate-pulse"
        style={{ borderBottom: "1px solid #252530" }}
      >
        {[["Issued", 32], ["Pending Requests", 80], ["Coverage Gaps", 80]].map(([label, w], i) => (
          <div key={i} className={`${i > 0 ? "px-10 border-l border-[#1C1C1C]" : "pr-10"}`}>
            <div className="h-7 rounded-md bg-[#1C1C1C] mb-2" style={{ width: 32 }} />
            <div className="h-2.5 rounded bg-[#181818]" style={{ width: w as number }} />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-6 px-10 shrink-0"
        style={{ height: 48, borderBottom: "1px solid #1C1C1C" }}
      >
        {[["Requests", true], ["Certificates", false]].map(([label, active], i) => (
          <div key={i} className="flex items-center gap-1.5 animate-pulse">
            <div
              className="h-3 rounded bg-[#1C1C1C]"
              style={{ width: i === 0 ? 60 : 80, opacity: active ? 1 : 0.5 }}
            />
          </div>
        ))}
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center px-10 animate-pulse"
            style={{ height: 56, borderBottom: "1px solid #111111" }}
          >
            <div className="h-3 rounded bg-[#161616]" style={{ width: 160 }} />
            <div className="ml-8 h-3 rounded bg-[#161616]" style={{ width: 120 }} />
            <div className="ml-auto h-3 rounded bg-[#161616]" style={{ width: 100 }} />
            <div className="ml-6 h-5 w-20 rounded-full bg-[#161616]" />
            <div className="ml-4 h-8 w-24 rounded-md bg-[#161616]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RenewalsLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "#0C0C0C" }}>

      {/* Header — 56px, same as real page */}
      <div className="flex items-center justify-between px-14 shrink-0" style={{ height: 56 }} />

      {/* Stats strip — 4 equal columns with large number + label */}
      <div
        className="flex items-stretch justify-around shrink-0"
        style={{ borderBottom: "1px solid #141414" }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="py-6 flex flex-col gap-2 items-center">
            <div className="h-8 w-10 rounded-md bg-[#1C1C1C] animate-pulse" />
            <div className="h-2 w-16 rounded bg-[#161616] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Search + Tabs bar — 60px */}
      <div
        className="shrink-0 px-14 flex items-center gap-6"
        style={{ height: 60, borderBottom: "1px solid #1A1A1A" }}
      >
        {/* Search box — 280px wide, rounded-xl */}
        <div
          className="rounded-xl shrink-0 animate-pulse"
          style={{ width: 280, height: 44, background: "#0E0E0E", border: "1px solid #1E1E1E" }}
        />
        <div className="flex-1" />
        {/* Tabs pill */}
        <div
          className="flex items-center gap-2 px-2 rounded-lg shrink-0"
          style={{ background: "#1A1A1A", height: 40 }}
        >
          {[110, 88, 76].map((w, i) => (
            <div
              key={i}
              className="rounded-md animate-pulse"
              style={{
                width: w,
                height: 28,
                background: i === 0 ? "#0E0E0E" : "transparent",
                border: i === 0 ? "1px solid #252525" : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* Table rows */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center px-14 animate-pulse"
            style={{ height: 56, borderBottom: "1px solid #0F0F0F" }}
          >
            <div className="h-3 rounded bg-[#161616]" style={{ width: 180 }} />
            <div className="ml-10 h-3 rounded bg-[#161616]" style={{ width: 130 }} />
            <div className="ml-10 h-3 rounded bg-[#161616]" style={{ width: 80 }} />
            <div className="ml-auto h-5 w-20 rounded-full bg-[#161616]" />
            <div className="ml-4 h-5 w-16 rounded-full bg-[#161616]" />
          </div>
        ))}
      </div>
    </div>
  );
}

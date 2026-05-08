export default function RenewalDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0C0C0C" }}>

      {/* Breadcrumb header — 56px */}
      <div
        className="flex items-center justify-between px-8 shrink-0"
        style={{ height: 56, borderBottom: "1px solid #181818" }}
      >
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-2.5 w-14 rounded bg-[#1C1C1C]" />
          <div className="h-2.5 w-2 rounded bg-[#181818]" />
          <div className="h-2.5 w-36 rounded bg-[#1C1C1C]" />
        </div>
        <div className="flex gap-2 animate-pulse">
          <div className="h-8 w-28 rounded-md bg-[#141414]" style={{ border: "1px solid #1C1C1C" }} />
          <div className="h-8 w-24 rounded-md bg-[#141414]" style={{ border: "1px solid #1C1C1C" }} />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col gap-5">

          {/* Policy identity card */}
          <div
            className="rounded-2xl p-6 animate-pulse"
            style={{ background: "#111111", border: "1px solid #1A1A1A" }}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="h-5 w-48 rounded bg-[#1C1C1C] mb-2" />
                <div className="h-3 w-32 rounded bg-[#181818]" />
              </div>
              <div className="h-6 w-20 rounded-full bg-[#1C1C1C]" />
            </div>
            <div className="grid grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-2 w-20 rounded bg-[#181818]" />
                  <div className="h-3.5 rounded bg-[#1C1C1C]" style={{ width: [120, 80, 100, 140, 90, 110][i] }} />
                </div>
              ))}
            </div>
          </div>

          {/* Campaign timeline */}
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center px-4 rounded-xl animate-pulse"
                style={{ height: 44, background: i === 0 ? "#141414" : "#0D0D0D", border: "1px solid #1A1A1A" }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: i === 0 ? "#2A2A2A" : "#1A1A1A" }} />
                <div className="ml-3 h-3 rounded bg-[#1C1C1C]" style={{ width: [140, 120, 110, 130, 100, 120][i] }} />
                <div className="ml-auto h-2.5 w-16 rounded bg-[#181818]" />
                <div className="ml-4 h-5 w-14 rounded-full bg-[#1A1A1A]" />
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar — narrow panel */}
        <div
          className="shrink-0 flex flex-col gap-6 px-5 py-6 overflow-hidden"
          style={{ width: 260, borderLeft: "1px solid #181818" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 animate-pulse">
              <div className="h-2 w-16 rounded bg-[#181818]" />
              <div className="h-3.5 rounded bg-[#1C1C1C]" style={{ width: [80, 100, 64, 90][i] }} />
            </div>
          ))}
          <div className="mt-2 flex flex-col gap-2 animate-pulse">
            <div className="h-8 w-full rounded-md bg-[#141414]" style={{ border: "1px solid #1C1C1C" }} />
            <div className="h-8 w-full rounded-md bg-[#141414]" style={{ border: "1px solid #1C1C1C" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

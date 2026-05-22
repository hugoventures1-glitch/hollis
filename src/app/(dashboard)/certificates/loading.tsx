export default function CertificatesLoading() {
  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header — 56px with buttons on right */}
      <div
        className="flex items-center justify-between px-10 shrink-0"
        style={{ height: 56, borderBottom: "1px solid var(--border)" }}
      >
        <div className="h-2.5 w-24 rounded bg-border animate-hollis-shimmer" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 rounded-md animate-hollis-shimmer" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} />
          <div className="h-8 w-24 rounded-md bg-hover-overlay animate-hollis-shimmer" />
        </div>
      </div>

      {/* Stats strip — horizontal, divided by borders */}
      <div
        className="flex items-center gap-0 px-10 py-7 shrink-0 animate-hollis-shimmer"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {[["Issued", 32], ["Pending Requests", 80], ["Coverage Gaps", 80]].map(([label, w], i) => (
          <div key={i} className={`${i > 0 ? "px-10 border-l border-border" : "pr-10"}`}>
            <div className="h-7 rounded-md bg-border mb-2" style={{ width: 32 }} />
            <div className="h-2.5 rounded bg-surface" style={{ width: w as number }} />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-6 px-10 shrink-0"
        style={{ height: 48, borderBottom: "1px solid var(--border)" }}
      >
        {[["Requests", true], ["Certificates", false]].map(([label, active], i) => (
          <div key={i} className="flex items-center gap-1.5 animate-hollis-shimmer">
            <div
              className="h-3 rounded bg-border"
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
            className="flex items-center px-10 animate-hollis-shimmer"
            style={{ height: 56, borderBottom: "1px solid var(--surface)" }}
          >
            <div className="h-3 rounded bg-surface-raised" style={{ width: 160 }} />
            <div className="ml-8 h-3 rounded bg-surface-raised" style={{ width: 120 }} />
            <div className="ml-auto h-3 rounded bg-surface-raised" style={{ width: 100 }} />
            <div className="ml-6 h-5 w-20 rounded-full bg-surface-raised" />
            <div className="ml-4 h-8 w-24 rounded-md bg-surface-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}

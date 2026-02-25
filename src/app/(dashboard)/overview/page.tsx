import {
  Zap,
  Plus,
  Filter,
  Bell,
  MoreHorizontal,
  CheckCircle2,
  Command,
  ArrowRight,
} from "lucide-react";

const workflows = [
  { id: "HOL-102", title: "Commercial General Liability",    client: "Apex Construction",   date: "Oct 24", priority: "High"   },
  { id: "HOL-103", title: "Workers Compensation Renewal",    client: "Eastside Logistics",  date: "Oct 25", priority: "High"   },
  { id: "HOL-104", title: "BOP Audit Filing",                client: "Main St Bakery",      date: "Oct 28", priority: "Normal" },
  { id: "HOL-105", title: "Personal Auto Policy Update",     client: "Marvin Richards",     date: "Oct 30", priority: "Normal" },
  { id: "HOL-106", title: "Certificate of Insurance Issuance", client: "Build-It Co.",     date: "Nov 02", priority: "Low"    },
  { id: "HOL-107", title: "High Value Homeowners Quote",     client: "Sarah Jenkins",       date: "Nov 04", priority: "Normal" },
  { id: "HOL-108", title: "Umbrella Coverage Renewal",       client: "Tom Harris",          date: "Nov 05", priority: "High"   },
  { id: "HOL-109", title: "Cyber Liability Assessment",      client: "Tech Solutions",      date: "Nov 10", priority: "Normal" },
  { id: "HOL-110", title: "Employment Practices Liability",  client: "Law Group LLP",       date: "Nov 12", priority: "Normal" },
  { id: "HOL-111", title: "Inland Marine Policy",            client: "Oceanic Freight",     date: "Nov 15", priority: "Low"    },
] as const;

const activityLog = [
  { text: "COI Issued",        client: "Build-It Co.",       time: "2m ago"    },
  { text: "Quote Sent",        client: "Lisa Vance",         time: "14m ago"   },
  { text: "Policy Bound",      client: "Apex Construction",  time: "1h ago"    },
  { text: "Document Chasing",  client: "Main St Bakery",     time: "2h ago"    },
  { text: "Renewal Notice",    client: "Eastside Logistics", time: "4h ago"    },
  { text: "Quote Requested",   client: "Sarah Jenkins",      time: "Yesterday" },
] as const;

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full bg-[#0d0d12] text-[#f5f5f7] antialiased select-none">

      {/* ── Top header ── */}
      <header className="h-[56px] shrink-0 border-b border-[#1e1e2a] flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <span className="text-[#5e5e64] hover:text-[#f5f5f7] cursor-pointer transition-colors">
            Workspace
          </span>
          <span className="text-[#2a2a35]">/</span>
          <span className="text-[#f5f5f7]">Overview</span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#1e1e2a] bg-white/[0.02] text-[#5e5e64] hover:text-[#f5f5f7] cursor-pointer transition-colors">
            <Filter size={14} />
            <span className="text-[13px] font-medium">Filter</span>
          </div>
          <button className="h-8 w-8 flex items-center justify-center text-[#5e5e64] hover:text-[#f5f5f7] transition-colors border border-[#1e1e2a] rounded bg-white/[0.02]">
            <Bell size={15} />
          </button>
          <div className="w-[1px] h-4 bg-[#1e1e2a] mx-0.5" />
          <button className="h-8 bg-[#00d4aa] text-black px-3.5 rounded text-[13px] font-bold hover:bg-[#00bfa0] transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(0,212,170,0.35),0_0_6px_rgba(0,212,170,0.2)]">
            <Plus size={14} strokeWidth={3} />
            New Policy
          </button>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <div className="shrink-0 px-12 py-11 border-b border-[#252530]">
        <div className="flex">
          {[
            { label: "Book Value",        value: "$2,482,000", change: "+12.5%"  },
            { label: "Active Policies",   value: "1,284",      change: "+2"      },
            { label: "Upcoming Renewals", value: "18",         red: true         },
            { label: "AI Accuracy",       value: "99.2%",      change: "+0.4%"   },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className={[
                "flex flex-col gap-2.5",
                i !== 0 ? "border-l border-[#1e1e2a] pl-12" : "",
                i !== 3 ? "pr-12" : "",
              ].join(" ")}
            >
              <span className="text-[12px] font-bold text-zinc-600 uppercase tracking-[0.12em]">
                {stat.label}
              </span>
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-5xl font-bold tracking-tight leading-none ${
                    stat.red ? "text-[#ff4d4d]" : "text-white"
                  }`}
                >
                  {stat.value}
                </span>
                {stat.change && (
                  <span className="text-[14px] font-semibold text-[#00d4aa] flex items-center gap-0.5">
                    <span className="text-[12px]">↑</span>
                    {stat.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-column content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Priority Workflows */}
        <div className="flex-1 overflow-y-auto min-w-0">

          {/* Table sub-header */}
          <div className="px-6 py-3 flex items-center justify-between sticky top-0 z-10 bg-[#0d0d12] border-b border-[#1e1e2a]">
            <div className="flex items-center gap-4">
              <span className="text-[14px] font-semibold text-zinc-500">
                Priority Workflows
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#00d4aa]/[0.1] text-[12px] font-bold text-[#00d4aa]">
                12
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Command size={14} className="text-[#2a2a35]" />
              <span className="text-[12px] font-bold text-[#2a2a35] uppercase tracking-widest">
                Sort by deadline
              </span>
            </div>
          </div>

          {/* Rows */}
          <div className="pb-20">
            {workflows.map((w) => {
              const dashIdx = w.id.indexOf("-");
              const prefix = w.id.slice(0, dashIdx);
              const num = w.id.slice(dashIdx + 1);
              return (
                <div
                  key={w.id}
                  className="grid grid-cols-12 items-center px-6 py-[10px] border-b border-[#1e1e2a]/60 hover:bg-white/[0.015] group transition-colors cursor-default"
                >
                  {/* ID — two-line stacked */}
                  <div className="col-span-1 flex items-start gap-2">
                    <CheckCircle2
                      size={14}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 transition-opacity shrink-0 mt-0.5"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] font-mono text-zinc-700 uppercase">
                        {prefix}-
                      </span>
                      <span className="text-[12px] font-mono text-zinc-500 uppercase">
                        {num}
                      </span>
                    </div>
                  </div>

                  {/* Policy name + client inline */}
                  <div className="col-span-8 flex items-center gap-4 pr-4 min-w-0 overflow-hidden">
                    <span className="text-[15px] font-medium text-white shrink-0 truncate">
                      {w.title}
                    </span>
                    <span className="text-[14px] text-zinc-400 truncate">
                      {w.client}
                    </span>
                  </div>

                  {/* Priority dot */}
                  <div className="col-span-1 flex items-center justify-center">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        w.priority === "High" ? "bg-[#ff4d4d]" : "bg-[#2a2a35]"
                      }`}
                    />
                  </div>

                  {/* Date */}
                  <div className="col-span-1 text-[14px] text-zinc-600 font-medium text-right">
                    {w.date}
                  </div>

                  {/* More */}
                  <div className="col-span-1 flex justify-end">
                    <MoreHorizontal
                      size={16}
                      className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Assistant panel ── */}
        <div className="w-[360px] shrink-0 bg-[#111118] border-l border-[#1e1e2a] overflow-y-auto flex flex-col">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-[#1e1e2a] flex items-center justify-between sticky top-0 bg-[#111118] z-10">
            <span className="text-[14px] font-semibold text-zinc-500">
              Assistant
            </span>
            <div className="w-2 h-2 rounded-full bg-[#00d4aa] shadow-[0_0_8px_rgba(0,212,170,0.8)]" />
          </div>

          <div className="p-5 space-y-9">

            {/* Hollis Insight card */}
            <div className="p-5 bg-[#1a1a24] border border-[#1e1e2a] rounded-lg">
              <div className="flex items-center gap-2.5 mb-4">
                <Zap size={15} className="text-[#00d4aa]" />
                <span className="text-[13px] font-bold text-[#f5f5f7] uppercase tracking-widest">
                  Hollis Insight
                </span>
              </div>
              <p className="text-[14px] text-zinc-500 leading-[1.65]">
                Apex Construction&apos;s premium rose{" "}
                <span className="text-[#00d4aa] font-semibold">15%</span>. No
                changes in underlying risk found.
              </p>
              <button className="mt-5 text-[13px] font-semibold text-zinc-500 hover:text-[#00d4aa] transition-colors flex items-center gap-1.5 group/btn">
                Compare Policies
                <ArrowRight
                  size={13}
                  className="group-hover/btn:translate-x-0.5 transition-transform"
                />
              </button>
            </div>

            {/* Activity Log */}
            <div>
              <h4 className="text-[12px] font-bold text-[#2a2a35] uppercase tracking-widest mb-6">
                Activity Log
              </h4>
              <div className="space-y-0">
                {activityLog.map((entry, i) => (
                  <div key={i} className="relative pl-4 border-l border-[#1e1e2a] pb-5 border-b border-[#1e1e2a]/50 last:pb-0 last:border-b-0 [&:not(:first-child)]:pt-5">
                    <div className="absolute top-1.5 -left-[3.5px] w-[6px] h-[6px] rounded-full bg-[#2a2a35]" />
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-[14px] font-semibold text-zinc-200">
                        {entry.text}
                      </span>
                      <span className="text-[11px] text-zinc-600 font-medium tracking-tight uppercase whitespace-nowrap shrink-0">
                        {entry.time}
                      </span>
                    </div>
                    <span className="text-[12px] text-zinc-600 font-medium">
                      {entry.client}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

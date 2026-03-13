"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Zap,
  Globe,
  Clock,
  Mic,
  ArrowUp,
  RefreshCcw,
  AlertTriangle,
  DollarSign,
  Award,
  Activity,
} from "lucide-react";

const CHIPS = [
  { label: "Renewals",     href: "/renewals",                 Icon: RefreshCcw   },
  { label: "Stalled",      href: "/renewals?filter=stalled",  Icon: AlertTriangle },
  { label: "Book Value",   href: "/renewals",                 Icon: DollarSign   },
  { label: "Certificates", href: "/certificates",             Icon: Award        },
  { label: "Activity",     href: "/activity",                 Icon: Activity     },
];

const SUGGESTIONS = [
  { prompt: "know what's expiring this week",            href: "/renewals"               },
  { prompt: "see which clients haven't responded yet",   href: "/renewals?filter=stalled" },
  { prompt: "review pending approvals in my queue",      href: "/review"                 },
];

export function FeedInput() {
  const [value, setValue] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    router.push("/renewals");
    setValue("");
  };

  return (
    <div>
      {/* Quick-action chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CHIPS.map(({ label, href, Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-opacity hover:opacity-70"
            style={{ background: "#111111", border: "1px solid #222222", color: "#888888" }}
          >
            <Icon size={11} />
            {label}
          </Link>
        ))}
      </div>

      {/* Suggestion rows */}
      <div className="space-y-3 mb-7">
        {SUGGESTIONS.map(({ prompt, href }) => (
          <Link
            key={prompt}
            href={href}
            className="block text-[14px] transition-opacity hover:opacity-60"
          >
            <span style={{ color: "#777777" }}>I want to </span>
            <span style={{ color: "#555555" }}>{prompt}</span>
          </Link>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "#111111", border: "1px solid #222222" }}
        >
          {/* Left action icons */}
          <div className="flex items-center gap-2.5" style={{ color: "#383838" }}>
            <button type="button" className="transition-colors hover:text-[#666666]">
              <Plus size={15} />
            </button>
            <button type="button" className="transition-colors hover:text-[#666666]">
              <Zap size={15} />
            </button>
            <button type="button" className="transition-colors hover:text-[#666666]">
              <Globe size={15} />
            </button>
            <button type="button" className="transition-colors hover:text-[#666666]">
              <Clock size={15} />
            </button>
          </div>

          {/* Text input */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="text-[13px] shrink-0" style={{ color: "#444444" }}>
              I want to
            </span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder=""
              className="flex-1 bg-transparent outline-none text-[13px] min-w-0"
              style={{ color: "#FAFAFA", caretColor: "#FAFAFA" }}
            />
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="transition-colors hover:text-[#666666]"
              style={{ color: "#383838" }}
            >
              <Mic size={15} />
            </button>
            <button
              type="submit"
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "#FAFAFA", color: "#0C0C0C" }}
            >
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Mail,
  MessageSquare,
  Phone,
  FileText,
  Loader2,
} from "lucide-react";

interface TimelineItem {
  id: string;
  source: "renewal" | "doc_chase" | "coi";
  channel: "email" | "sms" | "phone_script" | "coi";
  status: string;
  timestamp: string;
  subject?: string;
  description: string;
  link?: string;
}

interface CommunicationTimelineProps {
  clientId: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ChannelIcon({ channel }: { channel: TimelineItem["channel"] }) {
  const baseClass = "shrink-0";
  switch (channel) {
    case "email":
      return <Mail size={14} className={baseClass} />;
    case "sms":
      return <MessageSquare size={14} className={baseClass} />;
    case "phone_script":
      return <Phone size={14} className={baseClass} />;
    case "coi":
      return <FileText size={14} className={baseClass} />;
    default:
      return <Mail size={14} className={baseClass} />;
  }
}

function statusColor(status: string): string {
  if (
    status === "sent" ||
    status === "received" ||
    status === "delivered"
  )
    return "text-[#FAFAFA]";
  if (status === "failed" || status === "bounced" || status === "cancelled")
    return "text-red-400";
  return "text-[#8a8b91]";
}

export function CommunicationTimeline({ clientId }: CommunicationTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/clients/${clientId}/timeline`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItems(d.items ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex gap-4 px-5 py-3.5 rounded-xl bg-[#111118] border border-[#1e1e2a] animate-pulse"
          >
            <div className="w-[14px] h-[14px] rounded-full bg-zinc-800 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-3/4 rounded bg-zinc-800" />
              <div className="h-3 w-1/2 rounded bg-zinc-800 mt-2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-6 text-center">
        <p className="text-[13px] text-red-400">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-8 text-center">
        <p className="text-[13px] text-[#505057]">
          No communication history yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const colorClass = statusColor(item.status);
        const content = (
          <>
            <div className={`shrink-0 mt-0.5 ${colorClass}`}>
              <ChannelIcon channel={item.channel} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-medium ${colorClass}`}>
                {item.description}
              </div>
              <div className="text-[12px] text-[#505057] mt-0.5">
                {formatTimestamp(item.timestamp)}
              </div>
            </div>
          </>
        );

        const className =
          "flex gap-4 px-5 py-3.5 rounded-xl bg-[#111118] border border-[#1e1e2a] hover:border-[#1C1C1C] transition-colors group";

        if (item.link) {
          return (
            <Link
              key={`${item.source}-${item.id}`}
              href={item.link}
              className={className}
            >
              {content}
              <span className="text-[#6b6b6b] group-hover:text-[#FAFAFA] transition-colors shrink-0 self-center">
                →
              </span>
            </Link>
          );
        }

        return (
          <div key={`${item.source}-${item.id}`} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

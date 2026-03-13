import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { AuditEventType } from "@/types/renewals";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const EVENT_LABELS: Partial<Record<AuditEventType, string>> = {
  email_sent:              "Email sent",
  sms_sent:                "SMS sent",
  questionnaire_sent:      "Questionnaire sent",
  questionnaire_responded: "Questionnaire received",
  insurer_terms_logged:    "Insurer terms logged",
  submission_sent:         "Submission sent",
  recommendation_sent:     "Recommendation sent",
  client_confirmed:        "Renewal confirmed",
  final_notice_sent:       "Final notice sent",
  lapse_recorded:          "Lapse recorded",
  doc_requested:           "Document requested",
  doc_received:            "Document received",
  note_added:              "Note added",
  signal_received:         "Signal received",
  tier_1_action:           "Automated action",
  tier_2_drafted:          "Draft prepared",
  tier_3_escalated:        "Escalated",
  sequence_halted:         "Sequence paused",
  flag_set:                "Flag set",
};

// ── Page ──────────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  event_type: AuditEventType;
  channel: string | null;
  created_at: string;
  policies: { client_name: string } | { client_name: string }[] | null;
}

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86_400_000).toISOString();

  const [feedRes, sendCountRes, progressedRes, questionnaireRes] = await Promise.all([
    // Activity feed — last 50 audit entries with client name
    supabase
      .from("renewal_audit_log")
      .select("id, event_type, channel, created_at, policies(client_name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),

    // Touchpoints sent in last 30 days
    supabase
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("sent_at", thirtyDaysAgo),

    // Renewals confirmed in last 7 days
    supabase
      .from("renewal_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("event_type", "client_confirmed")
      .gte("created_at", sevenDaysAgo),

    // Questionnaire stats: sent vs responded
    supabase
      .from("renewal_audit_log")
      .select("event_type")
      .eq("user_id", user.id)
      .in("event_type", ["questionnaire_sent", "questionnaire_responded"]),
  ]);

  const feed = (feedRes.data ?? []) as AuditRow[];
  const touchpointCount = sendCountRes.count ?? 0;
  const progressedCount = progressedRes.count ?? 0;

  const questRows = questionnaireRes.data ?? [];
  const qSent = questRows.filter((r) => r.event_type === "questionnaire_sent").length;
  const qResponded = questRows.filter((r) => r.event_type === "questionnaire_responded").length;
  const replyRate = qSent > 0 ? Math.round((qResponded / qSent) * 100) : null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--background)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <header
        className="h-[56px] shrink-0 flex items-center px-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-[12px]" style={{ color: "#555555" }}>Activity</span>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="grid gap-6" style={{ gridTemplateColumns: "180px 1fr 180px" }}>

            {/* Left stat column */}
            <div className="flex flex-col gap-5 pt-20">
              <StatCard
                label="Touchpoints"
                value={touchpointCount.toString()}
                sub="last 30 days"
              />
              <StatCard
                label="Confirmed"
                value={progressedCount.toString()}
                sub="last 7 days"
              />
            </div>

            {/* Center feed */}
            <div className="min-w-0">
              {/* Heading */}
              <div className="flex items-center gap-3 mb-8">
                <h1
                  className="text-[32px] leading-none tracking-tight"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontWeight: 900,
                    color: "#FAFAFA",
                  }}
                >
                  Hollis is working.
                </h1>
                <span
                  className="w-1.5 h-1.5 rounded-full animate-hollis-pulse shrink-0"
                  style={{ background: "#FAFAFA" }}
                />
              </div>

              {/* Feed */}
              {feed.length === 0 ? (
                <p className="text-[13px]" style={{ color: "#333333" }}>
                  No activity yet — actions will appear here as Hollis works.
                </p>
              ) : (
                <div className="relative">
                  <div>
                    {feed.map((entry) => {
                      const clientName = Array.isArray(entry.policies)
                        ? entry.policies[0]?.client_name
                        : entry.policies?.client_name;
                      const label = EVENT_LABELS[entry.event_type] ?? entry.event_type.replace(/_/g, " ");
                      return (
                        <div
                          key={entry.id}
                          className="flex items-baseline justify-between gap-6 py-3"
                          style={{ borderBottom: "1px solid #1C1C1C" }}
                        >
                          <div className="min-w-0">
                            <span className="text-[13px]" style={{ color: "#FAFAFA" }}>
                              {label}
                            </span>
                            {clientName && (
                              <>
                                <span className="mx-1.5" style={{ color: "#333333" }}>·</span>
                                <span className="text-[12px]" style={{ color: "#555555" }}>
                                  {clientName}
                                </span>
                              </>
                            )}
                          </div>
                          <span
                            className="text-[11px] shrink-0 tabular-nums"
                            style={{ color: "#333333" }}
                          >
                            {timeAgo(entry.created_at)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Bottom fade */}
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-16"
                    style={{
                      background: "linear-gradient(to bottom, transparent, var(--background))",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Right stat column */}
            <div className="flex flex-col gap-5 pt-20">
              {replyRate !== null && (
                <StatCard
                  label="Reply Rate"
                  value={`${replyRate}%`}
                  sub="questionnaires"
                />
              )}
              <StatCard
                label="Total Sent"
                value={touchpointCount.toString()}
                sub="all time"
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "#555555" }}
      >
        {label}
      </span>
      <span
        className="text-[40px] leading-none tracking-tight"
        style={{
          fontFamily: "var(--font-playfair)",
          fontWeight: 700,
          color: danger ? "#FF4444" : "#FAFAFA",
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[11px]" style={{ color: "#333333" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

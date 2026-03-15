"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  Mail,
  MessageSquare,
  Phone,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import type { EmailTemplate, TemplateType } from "@/types/renewals";
import { TOUCHPOINT_LABELS } from "@/types/renewals";

const TEMPLATE_META: Record<TemplateType, { icon: React.ElementType; desc: string; hasSubject: boolean }> = {
  email_90: {
    icon: Mail,
    desc: "Warm proactive email sent 90 days before expiry to start the renewal conversation early.",
    hasSubject: true,
  },
  email_60: {
    icon: Mail,
    desc: "Follow-up email at 60 days if no response to the 90-day touch. Gently stresses the narrowing window.",
    hasSubject: true,
  },
  sms_30: {
    icon: MessageSquare,
    desc: "Short SMS text message sent 30 days out. Max 160 characters. Friendly and urgent.",
    hasSubject: false,
  },
  script_14: {
    icon: Phone,
    desc: "Call script for agents to use when calling clients 14 days before expiry. Not sent — displayed in dashboard.",
    hasSubject: false,
  },
};

const ORDERED_TYPES: TemplateType[] = ["email_90", "email_60", "sms_30", "script_14"];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateType | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/renewals/templates")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTemplates(data);
        else setError(data.error ?? "Failed to load templates");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  const getTemplate = (type: TemplateType) =>
    templates.find(t => t.template_type === type);

  const startEdit = (type: TemplateType) => {
    const t = getTemplate(type);
    setEditSubject(t?.subject ?? "");
    setEditBody(t?.body ?? "");
    setEditing(type);
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const meta = TEMPLATE_META[editing];
    const body: Record<string, unknown> = {
      template_type: editing,
      body: editBody,
    };
    if (meta.hasSubject) body.subject = editSubject;

    try {
      const res = await fetch("/api/renewals/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      setTemplates(prev => prev.map(t => t.template_type === editing ? data : t));
      setEditing(null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const toggleApprove = async (type: TemplateType) => {
    const t = getTemplate(type);
    const newVal = !t?.is_approved;
    try {
      const res = await fetch("/api/renewals/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_type: type, is_approved: newVal }),
      });
      const data = await res.json();
      if (res.ok) {
        setTemplates(prev => prev.map(t2 => t2.template_type === type ? data : t2));
      }
    } catch { /* silent */ }
  };

  const approvedCount = templates.filter(t => t.is_approved).length;
  const allApproved = approvedCount === 4;

  return (
    <div className="flex flex-col h-full bg-[#0C0C0C]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1C1C1C] shrink-0">
        <Link
          href="/renewals"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
        >
          <ArrowLeft size={13} />
          Renewals
        </Link>
        <ChevronRight size={12} className="text-[#6b6b6b]" />
        <span className="text-[13px] text-[#FAFAFA]">Templates</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[12px] ${allApproved ? "text-[#FAFAFA]" : "text-[#8a8a8a]"}`}>
            {approvedCount}/4 approved
          </span>
          {allApproved && (
            <span className="flex items-center gap-1 text-[12px] text-[#FAFAFA]">
              <CheckCircle size={12} /> Campaigns active
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-10">
          <h1 className="text-[22px] font-bold text-[#FAFAFA] mb-1">Campaign Templates</h1>
          <p className="text-[14px] text-[#8a8a8a] mb-8">
            These are the message templates Hollis uses for each campaign touchpoint.
            Review, edit, and approve all 4 before your first campaign sends.
          </p>

          {!allApproved && !loading && (
            <div className="flex items-start gap-3 rounded-lg bg-[#1C1C1C] border border-[#1C1C1C] px-4 py-3 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-[#888888] mt-1.5 shrink-0" />
              <div className="text-[13px] text-[#9e9e9e]">
                Once approved, Hollis will automatically personalize and send each message at the right time.
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 mb-6 text-[13px] text-red-300">
              {error}
              <button onClick={() => setError(null)} className="ml-auto">
                <X size={13} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-[#6b6b6b]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              {ORDERED_TYPES.map(type => {
                const t = getTemplate(type);
                const meta = TEMPLATE_META[type];
                const Icon = meta.icon;
                const isEditing = editing === type;

                return (
                  <div
                    key={type}
                    className={`rounded-xl border transition-colors ${
                      t?.is_approved
                        ? "bg-[#111111] border-[#1C1C1C]"
                        : "bg-[#111111] border-[#1C1C1C]"
                    }`}
                  >
                    {/* Template header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C1C1C]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          t?.is_approved ? "bg-[#FAFAFA]/[0.06]" : "bg-[#ffffff06]"
                        }`}>
                          <Icon size={15} className={t?.is_approved ? "text-[#FAFAFA]" : "text-[#8a8a8a]"} />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-[#FAFAFA]">
                            {TOUCHPOINT_LABELS[type]}
                          </div>
                          <div className="text-[12px] text-[#6b6b6b] mt-0.5">{meta.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {!isEditing && (
                          <button
                            onClick={() => startEdit(type)}
                            className="h-7 px-3 flex items-center gap-1.5 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] hover:border-[#3e3e4a] transition-colors"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => toggleApprove(type)}
                          className={`h-7 px-3 flex items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors ${
                            t?.is_approved
                              ? "bg-[#FAFAFA]/[0.06] text-[#FAFAFA] border border-[#1C1C1C] hover:bg-[#FAFAFA]/[0.04]"
                              : "bg-[#ffffff08] text-[#8a8a8a] border border-[#ffffff12] hover:text-[#FAFAFA]"
                          }`}
                        >
                          {t?.is_approved ? (
                            <><CheckCircle size={11} /> Approved</>
                          ) : (
                            "Approve"
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Template body */}
                    <div className="px-5 py-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          {meta.hasSubject && (
                            <div>
                              <label className="block text-[11px] font-medium text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                                Subject
                              </label>
                              <input
                                type="text"
                                value={editSubject}
                                onChange={e => setEditSubject(e.target.value)}
                                className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b]"
                                placeholder="Email subject..."
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-[11px] font-medium text-[#8a8a8a] mb-1.5 uppercase tracking-wider">
                              Body
                            </label>
                            <textarea
                              value={editBody}
                              onChange={e => setEditBody(e.target.value)}
                              rows={10}
                              className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2.5 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555] placeholder-[#6b6b6b] resize-y font-mono leading-relaxed"
                              placeholder="Message body..."
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={cancelEdit}
                              className="h-8 px-4 rounded-md border border-[#1C1C1C] text-[12px] text-[#8a8a8a] hover:text-[#FAFAFA] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="h-8 px-4 rounded-md bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {meta.hasSubject && t?.subject && (
                            <div className="text-[12px] font-medium text-[#8a8a8a] mb-2">
                              Subject: <span className="text-[#FAFAFA]">{t.subject}</span>
                            </div>
                          )}
                          <pre className="text-[12px] text-[#8a8a8a] whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                            {t?.body ?? ""}
                          </pre>
                          {t?.is_approved && t?.approved_at && (
                            <div className="mt-3 text-[11px] text-[#6b6b6b]">
                              Approved{" "}
                              {new Date(t.approved_at).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

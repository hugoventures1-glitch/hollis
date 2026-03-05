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
    <div className="flex flex-col h-full bg-[#0d0d12]">
      {/* Header */}
      <div className="flex items-center gap-3 px-10 h-[56px] border-b border-[#1e1e2a] shrink-0">
        <Link
          href="/renewals"
          className="flex items-center gap-1.5 text-[13px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
        >
          <ArrowLeft size={13} />
          Renewals
        </Link>
        <ChevronRight size={12} className="text-[#505057]" />
        <span className="text-[13px] text-[#f5f5f7]">Templates</span>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[12px] ${allApproved ? "text-[#00d4aa]" : "text-[#8a8b91]"}`}>
            {approvedCount}/4 approved
          </span>
          {allApproved && (
            <span className="flex items-center gap-1 text-[12px] text-[#00d4aa]">
              <CheckCircle size={12} /> Campaigns active
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-10">
          <h1 className="text-[22px] font-bold text-[#f5f5f7] mb-1">Campaign Templates</h1>
          <p className="text-[14px] text-[#8a8b91] mb-8">
            These are the message templates Hollis uses for each campaign touchpoint.
            Review, edit, and approve all 4 before your first campaign sends.
          </p>

          {!allApproved && !loading && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-950/30 border border-amber-700/40 px-4 py-3 mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div className="text-[13px] text-amber-300">
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
            <div className="flex items-center justify-center py-24 text-[#505057]">
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
                        ? "bg-[#111118] border-[#00d4aa]/25"
                        : "bg-[#111118] border-[#1e1e2a]"
                    }`}
                  >
                    {/* Template header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2a]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          t?.is_approved ? "bg-[#00d4aa]/10" : "bg-[#ffffff06]"
                        }`}>
                          <Icon size={15} className={t?.is_approved ? "text-[#00d4aa]" : "text-[#8a8b91]"} />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-[#f5f5f7]">
                            {TOUCHPOINT_LABELS[type]}
                          </div>
                          <div className="text-[12px] text-[#505057] mt-0.5">{meta.desc}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {!isEditing && (
                          <button
                            onClick={() => startEdit(type)}
                            className="h-7 px-3 flex items-center gap-1.5 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] hover:border-[#3e3e4a] transition-colors"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => toggleApprove(type)}
                          className={`h-7 px-3 flex items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors ${
                            t?.is_approved
                              ? "bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/30 hover:bg-[#00d4aa]/5"
                              : "bg-[#ffffff08] text-[#8a8b91] border border-[#ffffff12] hover:text-[#f5f5f7]"
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
                              <label className="block text-[11px] font-medium text-[#8a8b91] mb-1.5 uppercase tracking-wider">
                                Subject
                              </label>
                              <input
                                type="text"
                                value={editSubject}
                                onChange={e => setEditSubject(e.target.value)}
                                className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057]"
                                placeholder="Email subject..."
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-[11px] font-medium text-[#8a8b91] mb-1.5 uppercase tracking-wider">
                              Body
                            </label>
                            <textarea
                              value={editBody}
                              onChange={e => setEditBody(e.target.value)}
                              rows={10}
                              className="w-full bg-[#0d0d12] border border-[#2e2e3a] rounded-lg px-3 py-2.5 text-[13px] text-[#f5f5f7] outline-none focus:border-[#00d4aa]/50 placeholder-[#505057] resize-y font-mono leading-relaxed"
                              placeholder="Message body..."
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={cancelEdit}
                              className="h-8 px-4 rounded-md border border-[#2e2e3a] text-[12px] text-[#8a8b91] hover:text-[#f5f5f7] transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="h-8 px-4 rounded-md bg-[#00d4aa] text-[#0d0d12] text-[12px] font-semibold hover:bg-[#00c49b] transition-colors disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {meta.hasSubject && t?.subject && (
                            <div className="text-[12px] font-medium text-[#8a8b91] mb-2">
                              Subject: <span className="text-[#c5c5cb]">{t.subject}</span>
                            </div>
                          )}
                          <pre className="text-[12px] text-[#8a8b91] whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                            {t?.body ?? ""}
                          </pre>
                          {t?.is_approved && t?.approved_at && (
                            <div className="mt-3 text-[11px] text-[#505057]">
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

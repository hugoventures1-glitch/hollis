"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import Link from "next/link";

interface Policy {
  id: string;
  policy_name: string;
  campaign_stage: string | null;
}

interface QuickActionsProps {
  clientId: string;
  policies: Policy[];
  renewalWorkspaceHref?: string;
  className?: string;
}

export function QuickActions({ clientId, policies, renewalWorkspaceHref, className }: QuickActionsProps) {
  const [activePanel, setActivePanel] = useState<"pause" | "note" | "force" | null>(null);

  // Pause renewal state
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?.id ?? "");
  const [pauseUntil, setPauseUntil] = useState("");
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseSuccess, setPauseSuccess] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  // Force send state
  const SENDABLE_STAGES = ["pending", "email_90_sent", "email_60_sent", "sms_30_sent"];
  const NEXT_TOUCHPOINT: Record<string, { label: string; icon: string }> = {
    pending: { label: "90-day email", icon: "Email" },
    email_90_sent: { label: "60-day email", icon: "Email" },
    email_60_sent: { label: "30-day SMS", icon: "SMS" },
    sms_30_sent: { label: "14-day call script", icon: "Call script" },
  };
  const forcePolicies = policies.filter((p) => SENDABLE_STAGES.includes(p.campaign_stage ?? ""));
  const [forcePolicyId, setForcePolicyId] = useState(forcePolicies[0]?.id ?? "");
  const [forceLoading, setForceLoading] = useState(false);
  const [forceResult, setForceResult] = useState<{ channel: string; newStage: string } | null>(null);
  const [forceError, setForceError] = useState<string | null>(null);

  // Note state
  const [noteText, setNoteText] = useState("");
  const [notePolicyId, setNotePolicyId] = useState(policies[0]?.id ?? "");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const handlePauseRenewal = async () => {
    if (!selectedPolicyId || !pauseUntil) return;
    setPauseLoading(true);
    setPauseError(null);
    try {
      const res = await fetch(`/api/renewals/${selectedPolicyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renewal_paused: true, renewal_paused_until: pauseUntil }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to pause renewal");
      }
      setPauseSuccess(true);
      setTimeout(() => { setPauseSuccess(false); setActivePanel(null); }, 2000);
    } catch (err) {
      setPauseError(err instanceof Error ? err.message : "Failed to pause renewal");
    } finally {
      setPauseLoading(false);
    }
  };

  const handleForceSend = async () => {
    if (!forcePolicyId) return;
    setForceLoading(true);
    setForceError(null);
    try {
      const res = await fetch(`/api/actions/renew/${forcePolicyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Force send failed");
      if (d.blocked) {
        throw new Error(d.reason ?? "Send blocked — Tier 3 escalation");
      }
      if (d.flagged) {
        throw new Error(d.reason ?? "Send held for broker review");
      }
      setForceResult({ channel: d.channel, newStage: d.newStage });
      setTimeout(() => { setForceResult(null); setActivePanel(null); }, 3000);
    } catch (err) {
      setForceError(err instanceof Error ? err.message : "Force send failed");
    } finally {
      setForceLoading(false);
    }
  };

  const handleLogNote = async () => {
    if (!noteText.trim() || !notePolicyId) return;
    setNoteLoading(true);
    setNoteError(null);
    try {
      const res = await fetch("/api/agent/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy_id: notePolicyId,
          channel: "manual",
          raw_text: noteText.trim(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to log note");
      }
      setNoteSuccess(true);
      setNoteText("");
      setTimeout(() => { setNoteSuccess(false); setActivePanel(null); }, 2000);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Failed to log note");
    } finally {
      setNoteLoading(false);
    }
  };

  if (policies.length === 0) return null;

  return (
    <div className={`rounded-xl bg-surface border border-border p-5 flex flex-col gap-4${className ? ` ${className}` : ""}`}>
      <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">Quick Actions</div>

      <div className="flex flex-col gap-2">
        {/* Pause renewal — full width */}
        <button
          onClick={() => setActivePanel(activePanel === "pause" ? null : "pause")}
          className={`w-full px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors text-left ${
            activePanel === "pause"
              ? "border-[#555555] bg-hover-overlay text-text-primary"
              : "border-border text-text-secondary hover:border-[#3a3a3a] hover:text-text-primary"
          }`}
        >
          Pause renewal
        </button>

        {/* Log a note + Force send — side by side */}
        <div className="flex gap-2">
          <button
            onClick={() => setActivePanel(activePanel === "note" ? null : "note")}
            className={`flex-1 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors text-left ${
              activePanel === "note"
                ? "border-[#555555] bg-hover-overlay text-text-primary"
                : "border-border text-text-secondary hover:border-[#3a3a3a] hover:text-text-primary"
            }`}
          >
            Log a note
          </button>
          {forcePolicies.length > 0 && (
            <button
              onClick={() => setActivePanel(activePanel === "force" ? null : "force")}
              className={`px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                activePanel === "force"
                  ? "border-red-600 bg-red-900/30 text-red-400"
                  : "border-red-900/40 bg-red-950/20 text-red-500 hover:border-red-600 hover:text-red-400"
              }`}
            >
              Force send
            </button>
          )}
        </div>
      </div>

      {/* Force send panel */}
      {activePanel === "force" && (() => {
        const selectedForcePolicy = forcePolicies.find((p) => p.id === forcePolicyId);
        const next = NEXT_TOUCHPOINT[selectedForcePolicy?.campaign_stage ?? ""];
        return (
          <div className="space-y-3 pt-3 border-t border-border">
            <p className="text-[11px] text-amber-600/80">Fires the next scheduled touchpoint immediately, bypassing tier checks. For testing only.</p>
            {forcePolicies.length > 1 && (
              <div>
                <label className="block text-[11px] text-text-tertiary mb-1">Policy</label>
                <select
                  value={forcePolicyId}
                  onChange={(e) => { setForcePolicyId(e.target.value); setForceResult(null); setForceError(null); }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-text-secondary"
                >
                  {forcePolicies.map((p) => (
                    <option key={p.id} value={p.id}>{p.policy_name}</option>
                  ))}
                </select>
              </div>
            )}
            {next && !forceResult && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/30">
                <span className="text-[11px] text-amber-600/80 font-medium">Will send:</span>
                <span className="text-[12px] text-amber-400 font-semibold">{next.label}</span>
                <span className="text-[11px] text-amber-600/60">via {next.icon}</span>
              </div>
            )}
            {forceError && <p className="text-[12px] text-red-400">{forceError}</p>}
            {forceResult && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-950/30 border border-green-900/40">
                <span className="text-green-400 text-[13px]">✓</span>
                <span className="text-[12px] text-green-400 font-semibold">
                  {next?.label ?? forceResult.channel} sent successfully
                </span>
              </div>
            )}
            <button
              onClick={handleForceSend}
              disabled={forceLoading || !!forceResult}
              className="flex items-center gap-2 h-8 px-4 rounded-lg bg-amber-600 text-white text-[12px] font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {forceLoading && <Loader2 size={12} className="animate-spin" />}
              {next ? `Send ${next.label} now` : "Send next touchpoint"}
            </button>
          </div>
        );
      })()}

      {/* Pause renewal panel */}
      {activePanel === "pause" && (
        <div className="space-y-3 pt-3 border-t border-border">
          {policies.length > 1 && (
            <div>
              <label className="block text-[11px] text-text-tertiary mb-1">Policy</label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-text-secondary"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">Pause until</label>
            <input
              type="date"
              value={pauseUntil}
              onChange={(e) => setPauseUntil(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-text-secondary"
            />
          </div>
          {pauseError && <p className="text-[12px] text-red-400">{pauseError}</p>}
          {pauseSuccess && <p className="text-[12px] text-green-400">Renewal paused.</p>}
          <button
            onClick={handlePauseRenewal}
            disabled={pauseLoading || !pauseUntil || pauseSuccess}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-text-primary text-text-inverse text-[12px] font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {pauseLoading && <Loader2 size={12} className="animate-spin" />}
            Confirm pause
          </button>
        </div>
      )}

      {/* Log a note panel */}
      {activePanel === "note" && (
        <div className="space-y-3 pt-3 border-t border-border">
          {policies.length > 1 && (
            <div>
              <label className="block text-[11px] text-text-tertiary mb-1">Policy</label>
              <select
                value={notePolicyId}
                onChange={(e) => setNotePolicyId(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-text-secondary"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-text-tertiary mb-1">Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Enter your note here…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary placeholder-text-secondary outline-none focus:border-text-secondary resize-none"
            />
          </div>
          {noteError && <p className="text-[12px] text-red-400">{noteError}</p>}
          {noteSuccess && <p className="text-[12px] text-green-400">Note logged.</p>}
          <button
            onClick={handleLogNote}
            disabled={noteLoading || !noteText.trim() || noteSuccess}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-text-primary text-text-inverse text-[12px] font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {noteLoading && <Loader2 size={12} className="animate-spin" />}
            Log note
          </button>
        </div>
      )}

      {/* VIEW RENEWAL */}
      {renewalWorkspaceHref && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-widest">View Renewal</div>
          <Link
            href={renewalWorkspaceHref}
            className="w-full flex items-center justify-center px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors"
            style={{ background: "#1A3A5C", color: "#7BAFD4", border: "1px solid #1E4A73" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#1E4A73"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#1A3A5C"; }}
          >
            Open renewal workspace →
          </Link>
        </div>
      )}
    </div>
  );
}

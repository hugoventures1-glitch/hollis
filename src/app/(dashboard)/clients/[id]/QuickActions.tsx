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
}

export function QuickActions({ clientId, policies, renewalWorkspaceHref }: QuickActionsProps) {
  const [activePanel, setActivePanel] = useState<"pause" | "questionnaire" | "note" | "force" | null>(null);

  // Pause renewal state
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?.id ?? "");
  const [pauseUntil, setPauseUntil] = useState("");
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseSuccess, setPauseSuccess] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  // Questionnaire state
  const questionnairePolicies = policies.filter(
    (p) => !["questionnaire_sent", "submission_sent", "recommendation_sent", "final_notice_sent", "confirmed", "complete", "lapsed"].includes(p.campaign_stage ?? "")
  );
  const [qPolicyId, setQPolicyId] = useState(questionnairePolicies[0]?.id ?? "");
  const [qLoading, setQLoading] = useState(false);
  const [qSuccess, setQSuccess] = useState(false);
  const [qError, setQError] = useState<string | null>(null);

  // Force send state
  const SENDABLE_STAGES = ["pending", "email_90_sent", "email_60_sent", "sms_30_sent"];
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

  const handleSendQuestionnaire = async () => {
    if (!qPolicyId) return;
    setQLoading(true);
    setQError(null);
    try {
      const res = await fetch(`/api/renewals/${qPolicyId}/questionnaire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to send questionnaire");
      }
      setQSuccess(true);
      setTimeout(() => { setQSuccess(false); setActivePanel(null); }, 2000);
    } catch (err) {
      setQError(err instanceof Error ? err.message : "Failed to send questionnaire");
    } finally {
      setQLoading(false);
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
    <div className="rounded-xl bg-[#111111] border border-[#1C1C1C] p-5 flex flex-col gap-4">
      <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-widest">Quick Actions</div>

      <div className="flex flex-col gap-2">
        {/* Pause renewal — full width */}
        <button
          onClick={() => setActivePanel(activePanel === "pause" ? null : "pause")}
          className={`w-full px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors text-left ${
            activePanel === "pause"
              ? "border-[#555555] bg-[#FAFAFA]/[0.06] text-[#FAFAFA]"
              : "border-[#1C1C1C] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#FAFAFA]"
          }`}
        >
          Pause renewal
        </button>

        {/* Send questionnaire — full width (conditional) */}
        {questionnairePolicies.length > 0 && (
          <button
            onClick={() => setActivePanel(activePanel === "questionnaire" ? null : "questionnaire")}
            className={`w-full px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors text-left ${
              activePanel === "questionnaire"
                ? "border-[#555555] bg-[#FAFAFA]/[0.06] text-[#FAFAFA]"
                : "border-[#1C1C1C] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#FAFAFA]"
            }`}
          >
            Send questionnaire
          </button>
        )}

        {/* Log a note + Force send — side by side */}
        <div className="flex gap-2">
          <button
            onClick={() => setActivePanel(activePanel === "note" ? null : "note")}
            className={`flex-1 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors text-left ${
              activePanel === "note"
                ? "border-[#555555] bg-[#FAFAFA]/[0.06] text-[#FAFAFA]"
                : "border-[#1C1C1C] text-[#8a8a8a] hover:border-[#3a3a3a] hover:text-[#FAFAFA]"
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
      {activePanel === "force" && (
        <div className="space-y-3 pt-3 border-t border-[#1C1C1C]">
          <p className="text-[11px] text-amber-600/80">Fires the next scheduled touchpoint immediately, bypassing tier checks. For testing only.</p>
          {forcePolicies.length > 1 && (
            <div>
              <label className="block text-[11px] text-[#6b6b6b] mb-1">Policy</label>
              <select
                value={forcePolicyId}
                onChange={(e) => setForcePolicyId(e.target.value)}
                className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555]"
              >
                {forcePolicies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          {forceError && <p className="text-[12px] text-red-400">{forceError}</p>}
          {forceResult && (
            <p className="text-[12px] text-amber-400">
              Sent via {forceResult.channel} → {forceResult.newStage}
            </p>
          )}
          <button
            onClick={handleForceSend}
            disabled={forceLoading || !!forceResult}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-amber-600 text-white text-[12px] font-semibold hover:bg-amber-500 transition-colors disabled:opacity-50"
          >
            {forceLoading && <Loader2 size={12} className="animate-spin" />}
            Send next touchpoint
          </button>
        </div>
      )}

      {/* Pause renewal panel */}
      {activePanel === "pause" && (
        <div className="space-y-3 pt-3 border-t border-[#1C1C1C]">
          {policies.length > 1 && (
            <div>
              <label className="block text-[11px] text-[#6b6b6b] mb-1">Policy</label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555]"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-[#6b6b6b] mb-1">Pause until</label>
            <input
              type="date"
              value={pauseUntil}
              onChange={(e) => setPauseUntil(e.target.value)}
              className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555]"
            />
          </div>
          {pauseError && <p className="text-[12px] text-red-400">{pauseError}</p>}
          {pauseSuccess && <p className="text-[12px] text-green-400">Renewal paused.</p>}
          <button
            onClick={handlePauseRenewal}
            disabled={pauseLoading || !pauseUntil || pauseSuccess}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50"
          >
            {pauseLoading && <Loader2 size={12} className="animate-spin" />}
            Confirm pause
          </button>
        </div>
      )}

      {/* Send questionnaire panel */}
      {activePanel === "questionnaire" && (
        <div className="space-y-3 pt-3 border-t border-[#1C1C1C]">
          {questionnairePolicies.length > 1 && (
            <div>
              <label className="block text-[11px] text-[#6b6b6b] mb-1">Policy</label>
              <select
                value={qPolicyId}
                onChange={(e) => setQPolicyId(e.target.value)}
                className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555]"
              >
                {questionnairePolicies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          {qError && <p className="text-[12px] text-red-400">{qError}</p>}
          {qSuccess && <p className="text-[12px] text-green-400">Questionnaire sent.</p>}
          <button
            onClick={handleSendQuestionnaire}
            disabled={qLoading || !qPolicyId || qSuccess}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50"
          >
            {qLoading && <Loader2 size={12} className="animate-spin" />}
            Send questionnaire
          </button>
        </div>
      )}

      {/* Log a note panel */}
      {activePanel === "note" && (
        <div className="space-y-3 pt-3 border-t border-[#1C1C1C]">
          {policies.length > 1 && (
            <div>
              <label className="block text-[11px] text-[#6b6b6b] mb-1">Policy</label>
              <select
                value={notePolicyId}
                onChange={(e) => setNotePolicyId(e.target.value)}
                className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#555555]"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.policy_name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] text-[#6b6b6b] mb-1">Note</label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Enter your note here…"
              className="w-full bg-[#0C0C0C] border border-[#1C1C1C] rounded-lg px-3 py-2 text-[13px] text-[#FAFAFA] placeholder-[#555555] outline-none focus:border-[#555555] resize-none"
            />
          </div>
          {noteError && <p className="text-[12px] text-red-400">{noteError}</p>}
          {noteSuccess && <p className="text-[12px] text-green-400">Note logged.</p>}
          <button
            onClick={handleLogNote}
            disabled={noteLoading || !noteText.trim() || noteSuccess}
            className="flex items-center gap-2 h-8 px-4 rounded-lg bg-[#FAFAFA] text-[#0C0C0C] text-[12px] font-semibold hover:bg-[#E8E8E8] transition-colors disabled:opacity-50"
          >
            {noteLoading && <Loader2 size={12} className="animate-spin" />}
            Log note
          </button>
        </div>
      )}

      {/* VIEW RENEWAL */}
      {renewalWorkspaceHref && (
        <div className="flex flex-col gap-2 pt-1 border-t border-[#1C1C1C]">
          <div className="text-[11px] font-semibold text-[#6b6b6b] uppercase tracking-widest">View Renewal</div>
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

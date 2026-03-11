"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/actions/MicroToast";

interface SubmissionPanelProps {
  policyId: string;
  hasTerms: boolean;
}

export function SubmissionPanel({ policyId, hasTerms }: SubmissionPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [emails, setEmails] = useState<string[]>([""]);
  const [sent, setSent] = useState(false);
  const [sentAddresses, setSentAddresses] = useState<string[]>([]);

  const updateEmail = (i: number, value: string) => {
    setEmails(prev => prev.map((e, idx) => (idx === i ? value : e)));
  };

  const addEmail = () => setEmails(prev => [...prev, ""]);

  const removeEmail = (i: number) => {
    setEmails(prev => prev.filter((_, idx) => idx !== i));
  };

  const validEmails = emails.map(e => e.trim()).filter(e => e.includes("@"));

  const handleSend = () => {
    if (validEmails.length === 0) {
      toast("Add at least one insurer email address", "error");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/renewals/${policyId}/submission`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ insurer_emails: validEmails }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to send submission");
        setSentAddresses(validEmails);
        setSent(true);
        router.refresh();
        toast("Submission sent to all insurers");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed", "error");
      }
    });
  };

  if (sent) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 space-y-3">
        <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest">
          Submission Builder
        </div>
        <div className="rounded-lg bg-[#00d4aa]/[0.06] border border-[#00d4aa]/20 px-4 py-4 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#00d4aa]">
            <CheckCircle2 size={15} />
            Submission sent
          </div>
          <ul className="space-y-1">
            {sentAddresses.map((addr) => (
              <li key={addr} className="text-[12px] text-zinc-400">→ {addr}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => { setSent(false); setEmails([""]); setSentAddresses([]); }}
          className="text-[12px] text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          Send to additional insurers
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1e1e2a] p-5 space-y-4">
      <div className="text-[11px] font-semibold text-[#8a8b91] uppercase tracking-widest">
        Submission Builder
      </div>

      {!hasTerms && (
        <div className="rounded-lg bg-amber-950/20 border border-amber-800/30 px-4 py-3 text-[12px] text-amber-400">
          Add at least one insurer quote before generating a submission.
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[12px] text-zinc-400">
          Enter insurer email addresses. Claude Sonnet will build a formal underwriting submission from the client questionnaire, insurer quotes, and policy history.
        </div>

        {emails.map((email, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={e => updateEmail(i, e.target.value)}
              placeholder={`insurer${i + 1}@example.com`}
              disabled={isPending}
              className="flex-1 text-[13px] bg-[#0d0d12] border border-[#2a2a35] rounded-lg px-3 py-2 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#00d4aa]/50 disabled:opacity-50"
            />
            {emails.length > 1 && (
              <button
                onClick={() => removeEmail(i)}
                disabled={isPending}
                className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-50"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addEmail}
          disabled={isPending}
          className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-400 transition-colors disabled:opacity-50"
        >
          <Plus size={12} />
          Add another insurer
        </button>
      </div>

      <button
        onClick={handleSend}
        disabled={isPending || !hasTerms || validEmails.length === 0}
        className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-lg bg-[#0891b2]/10 text-[#22d3ee] hover:bg-[#0891b2]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
      >
        {isPending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Building submission with Claude Sonnet…
          </>
        ) : (
          <>
            <Send size={14} />
            Generate & Send Submission
          </>
        )}
      </button>
    </div>
  );
}
